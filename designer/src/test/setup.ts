import "@testing-library/jest-dom";

// localStorage のモック（jsdom は実装済みだがテスト間でリセット）
beforeEach(() => {
  localStorage.clear();
});
