import "@testing-library/jest-dom";
import { beforeEach } from "vitest";

// localStorage のモック（jsdom は実装済みだがテスト間でリセット）
beforeEach(() => {
  localStorage.clear();
});
