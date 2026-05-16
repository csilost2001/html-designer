# Java Spring Boot — Controller テンプレート

ProcessFlow の `actions[].httpRoute` から `@RestController` / Spring MVC Controller を生成する。

## フィールドマッピング

| ProcessFlow JSON フィールド | Controller 生成物 |
|---|---|
| `actions[].httpRoute.method` | `@GetMapping` / `@PostMapping` / `@PutMapping` / `@DeleteMapping` / `@PatchMapping` |
| `actions[].httpRoute.path` | `@RequestMapping("/api/...")` の value |
| `actions[].httpRoute.auth: "required"` | Spring Security の `@PreAuthorize` または SecurityConfig 設定 |
| `actions[].inputs[]` | `@RequestBody` DTO / `@RequestParam` / `@PathVariable` |
| `actions[].outputs[]` | `ResponseEntity<T>` の型引数 |
| `actions[].responses[]` | HTTP ステータスコード (200/400/422 等) |
| `steps` (kind=screenTransition) | `return "redirect:/path"` (MVC の場合) |

## テンプレート本体 — REST API (httpRoute.method = POST 等)

```java
package com.example.{{project.meta.name | camelCase}}.controller;

import com.example.{{project.meta.name | camelCase}}.dto.*;
import com.example.{{project.meta.name | camelCase}}.service.{{processFlow.meta.name | toPascalCase}}Service;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * {{processFlow.meta.name}} コントローラ。
 *
 * ProcessFlow: {{processFlow.meta.id}} ({{processFlow.meta.name}})
 * httpRoute: {{processFlow.actions[0].httpRoute.method}} {{processFlow.actions[0].httpRoute.path}}
 */
@RestController
@RequestMapping("{{processFlow.actions[0].httpRoute.path | basePath}}")
@RequiredArgsConstructor
@Slf4j
public class {{processFlow.meta.name | toPascalCase}}Controller {

    private final {{processFlow.meta.name | toPascalCase}}Service {{processFlow.meta.name | toCamelCase}}Service;

    /**
     * {{processFlow.actions[0].name}}。
     * <p>
     * {{processFlow.actions[0].description}}
     * </p>
     *
     * @param request リクエスト DTO
     * @param session HTTP セッション (sessionCustomerId を取得するため)
     * @return 処理結果 (200/400/422)
     */
    @{{processFlow.actions[0].httpRoute.method | toSpringAnnotation}}Mapping("{{processFlow.actions[0].httpRoute.path | pathSuffix}}")
    public ResponseEntity<{{processFlow.actions[0].name | toPascalCase}}Response> {{processFlow.actions[0].name | toCamelCase}}(
            @Valid @RequestBody {{processFlow.actions[0].name | toPascalCase}}Request request,
            HttpSession session) {

        // ambientVariables から sessionCustomerId を取得
        Long sessionCustomerId = (Long) session.getAttribute("customerId");
        if (sessionCustomerId == null) {
            return ResponseEntity.status(401).build();
        }

        {{processFlow.actions[0].name | toPascalCase}}Response response =
                {{processFlow.meta.name | toCamelCase}}Service.execute(request, sessionCustomerId);

        return ResponseEntity.ok(response);
    }
}
```

## テンプレート本体 — MVC (Thymeleaf + redirect)

```java
package com.example.{{project.meta.name | camelCase}}.controller;

import com.example.{{project.meta.name | camelCase}}.service.{{processFlow.meta.name | toPascalCase}}Service;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

/**
 * {{processFlow.meta.name}} MVC コントローラ (Thymeleaf)。
 */
@Controller
@RequestMapping("{{screen.path}}")
@RequiredArgsConstructor
public class {{screen.name | toPascalCase}}Controller {

    private final {{processFlow.meta.name | toPascalCase}}Service {{processFlow.meta.name | toCamelCase}}Service;

    @GetMapping
    public String show(Model model, HttpSession session) {
        // 画面表示: GET → Thymeleaf テンプレート名 = screen.path をテンプレートパスに変換
        return "{{screen.path | toThymeleafTemplatePath}}";
    }

    @PostMapping
    public String submit(
            @ModelAttribute {{processFlow.actions[0].name | toPascalCase}}Form form,
            HttpSession session,
            Model model) {
        // 処理実行
        // 成功時: steps (kind=screenTransition) → redirect
        return "redirect:{{screen.transitions[0].targetPath}}";
    }
}
```

## HTTP メソッド変換

| ProcessFlow `httpRoute.method` | Spring アノテーション |
|---|---|
| `"GET"` | `@GetMapping` |
| `"POST"` | `@PostMapping` |
| `"PUT"` | `@PutMapping` |
| `"DELETE"` | `@DeleteMapping` |
| `"PATCH"` | `@PatchMapping` |

## responses[] → ResponseEntity

| ProcessFlow `responses[].status` | Java |
|---|---|
| `200` | `ResponseEntity.ok(body)` |
| `201` | `ResponseEntity.created(location).body(body)` |
| `400` | `ResponseEntity.badRequest().body(errorBody)` |
| `422` | `ResponseEntity.unprocessableEntity().body(errorBody)` |
| `404` | `ResponseEntity.notFound().build()` |
