package com.example.retail.service;

import com.example.retail.dto.OrderConfirmRequest;
import com.example.retail.dto.OrderConfirmResponse;
import com.example.retail.entity.Order;
import com.example.retail.event.OrderConfirmedEvent;
import com.example.retail.exception.CartEmptyException;
import com.example.retail.exception.OrderConfirmFailedException;
import com.example.retail.exception.StockShortageException;
import com.example.retail.repository.CartItemRepository;
import com.example.retail.repository.CartRepository;
import com.example.retail.repository.InventoryRepository;
import com.example.retail.repository.OrderItemRepository;
import com.example.retail.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 注文確定サービス。
 *
 * <p>
 * カート内容を 1 TX (@conv.tx.orderConfirm) で確定する。
 * 在庫減算 → 注文番号採番 → orders INSERT → order_items loop INSERT → カートクリアの順に原子的に実行する。
 * 在庫減算は cart_items.store_id 単位で各店舗の inventory に対して実行する (multi-store inventory 整合)。
 * TX 失敗時は 422 を返す。TX 後に persistedOrder を再取得してから注文確定イベントを発行する。
 * </p>
 *
 * ProcessFlow ID: f81dd9e0-794c-4539-a2a5-9cbcc0a75899
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OrderConfirmService {

    private final CartRepository cartRepository;
    private final CartItemRepository cartItemRepository;
    private final InventoryRepository inventoryRepository;
    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * 注文確定実行。
     *
     * <p>カート確認画面の「注文確定」ボタン押下で起動。
     * 配送先情報を入力として受け取り、1 TX で在庫引き当て・注文登録・カートクリアを原子的に実行する。</p>
     *
     * @param request         リクエスト DTO (shippingPostalCode / shippingAddress / note / paymentMethod)
     * @param sessionCustomerId セッション顧客 ID (ambientVariables.sessionCustomerId)
     * @return 注文確定レスポンス DTO (orderId / orderNumber / totalAmount)
     *
     * ProcessFlow action: act-001
     * httpRoute: POST /api/retail/orders
     */
    public OrderConfirmResponse execute(OrderConfirmRequest request, Long sessionCustomerId) {

        // step-01: バリデーション (Bean Validation は @Valid で Controller に委譲)
        // shippingPostalCode は必須かつハイフンなし 7 桁数字
        // shippingAddress は必須 (300 文字以内)
        // paymentMethod は credit_card / bank_transfer / cod のいずれか

        // step-02: 顧客のアクティブカートと cart_items を取得 (multi-store inventory 整合のため store 情報も JOIN)
        List<Map<String, Object>> cartItems = cartItemRepository.findActiveCartItemsWithStore(sessionCustomerId);

        // step-03: カートが空の場合は 422 を返す
        if (cartItems == null || cartItems.isEmpty()) {
            throw new CartEmptyException("カートが空です。商品をカートに追加してから注文確定してください。");
        }

        // step-04: totalAmount 計算 (unit_price_snapshot * quantity の合計)
        long totalAmount = cartItems.stream()
                .mapToLong(item -> {
                    long unitPrice = ((Number) item.get("unitPriceSnapshot")).longValue();
                    int quantity = ((Number) item.get("quantity")).intValue();
                    return unitPrice * quantity;
                })
                .sum();

        // step-05: 注文番号採番 (DB シーケンス seq_order_number から NEXTVAL)
        // @conv.numbering.orderNumber 規約: ORD-YYYY-NNNNNN
        // TX 外採番のため void (スキップ番号) は許容 (ADR-001)
        String newOrderNumber = orderRepository.nextOrderNumber();

        // step-06: 注文確定 TX (isolationLevel=READ_COMMITTED, propagation=REQUIRED, timeoutMs=10000)
        // rollbackOn: [STOCK_SHORTAGE, ORDER_NUMBER_CONFLICT]
        Order persistedOrder = executeOrderConfirmTransaction(
                request, sessionCustomerId, cartItems, totalAmount, newOrderNumber);

        // step-09: retail.order.confirmed イベントを発行 (TX コミット後 + persistedOrder 再取得後)
        eventPublisher.publishEvent(new OrderConfirmedEvent(
                this,
                persistedOrder.getId(),
                persistedOrder.getOrderNumber(),
                persistedOrder.getCustomerId(),
                persistedOrder.getTotalAmount()
        ));

        // step-10: 200 OK レスポンスを返す
        return new OrderConfirmResponse(
                persistedOrder.getId(),
                persistedOrder.getOrderNumber(),
                persistedOrder.getTotalAmount(),
                persistedOrder.getOrderedAt(),
                "注文が確定しました。注文番号: " + persistedOrder.getOrderNumber()
        );
    }

    /**
     * 注文確定 TX。
     * step-06 (transactionScope) に相当。
     *
     * 在庫減算 → orders INSERT → order_items loop INSERT → カートクリアを原子的に実行し、
     * TX コミット後に orders を再取得して返す (ADR-002 準拠)。
     *
     * @throws StockShortageException        在庫不足 (rollbackOn: STOCK_SHORTAGE)
     * @throws DataIntegrityViolationException 注文番号 UNIQUE 制約違反 (rollbackOn: ORDER_NUMBER_CONFLICT)
     * @throws OrderConfirmFailedException    TX 後の re-fetch 失敗
     */
    @Transactional(isolation = Isolation.READ_COMMITTED, timeout = 10)
    protected Order executeOrderConfirmTransaction(
            OrderConfirmRequest request,
            Long sessionCustomerId,
            List<Map<String, Object>> cartItems,
            long totalAmount,
            String newOrderNumber) {

        // step-06-01: カート明細を 1 件ずつ在庫減算 (loop, kind=dbAccess, operation=retail:DECREMENT_STOCK)
        // store_id は cart_items から引き継ぎ (step-02 で取得済)
        for (Map<String, Object> cartItem : cartItems) {
            long productId = ((Number) cartItem.get("productId")).longValue();
            long storeId = ((Number) cartItem.get("storeId")).longValue();
            int quantity = ((Number) cartItem.get("quantity")).intValue();

            // step-06-01-a: 在庫減算 (affectedRowsCheck = 1 行、0 件なら STOCK_SHORTAGE)
            int updated = inventoryRepository.decrementStock(productId, storeId, quantity);
            if (updated != 1) {
                log.warn("在庫不足: productId={}, storeId={}, requestedQty={}", productId, storeId, quantity);
                throw new StockShortageException("在庫が不足しています。");
            }
        }

        // step-06-02: orders テーブルに注文レコードを INSERT
        // affectedRowsCheck = 1 行、order_number UNIQUE 制約違反は DataIntegrityViolationException として伝播
        Order order = new Order();
        order.setOrderNumber(newOrderNumber);
        order.setCustomerId(sessionCustomerId);
        order.setStatus("pending");
        order.setTotalAmount(totalAmount);
        order.setTaxAmount((long) Math.floor(totalAmount * 0.10));  // @conv.tax.standard.rate = 0.10
        order.setShippingPostalCode(request.getShippingPostalCode());
        order.setShippingAddress(request.getShippingAddress());
        order.setNote(request.getNote());
        order.setPaymentMethod(request.getPaymentMethod());
        order.setOrderedAt(LocalDateTime.now());
        orderRepository.save(order);

        // step-06-03: order_items に 1 行ずつ INSERT (loop, kind=dbAccess, operation=INSERT)
        // 単価・商品名はスナップショットとしてコピー (ADR-006 multi-store 整合: store_code_snapshot を含む)
        for (Map<String, Object> cartItem : cartItems) {
            orderItemRepository.insertOrderItem(
                    order.getId(),
                    ((Number) cartItem.get("productId")).longValue(),
                    (String) cartItem.get("storeCode"),
                    (String) cartItem.get("productCode"),
                    (String) cartItem.get("productName"),
                    ((Number) cartItem.get("unitPriceSnapshot")).longValue(),
                    ((Number) cartItem.get("quantity")).intValue()
            );
        }

        // step-06-04-a: cart_items を全削除 (CLEAR_CART step 1/2)
        cartItemRepository.deleteByCustomerActiveCart(sessionCustomerId);

        // step-06-04-b: carts.status を 'ordered' に更新 (CLEAR_CART step 2/2)
        cartRepository.updateStatusToOrdered(sessionCustomerId);

        // step-08: TX コミット後に orders を再取得 (ADR-002: TX 内変数ネスト参照回避)
        // @Transactional メソッドがリターンした時点で TX がコミットされるため、
        // 再取得は本メソッドの呼び出し元 (execute) で行う。ここでは insertedOrder の id を返す。
        // 実際の再取得は execute() 内で別 @Transactional なし呼び出しとする場合もある。
        Order persisted = orderRepository.findByOrderNumber(newOrderNumber)
                .orElseThrow(() -> {
                    // step-08b: persistedOrder == null ガード (ADR-005)
                    log.error("注文確定後の再取得失敗: orderNumber={}, customerId={}", newOrderNumber, sessionCustomerId);
                    return new OrderConfirmFailedException(
                            "注文の登録は完了しましたが、注文情報の取得に失敗しました。しばらく経ってから注文履歴を確認してください。");
                });

        return persisted;
    }
}
