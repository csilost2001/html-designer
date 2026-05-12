package com.harmony.retail.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Spring Security 6 は loginPage("/login") で指定した path を自動 serve しない。
 * GET /login に対する明示的なマッピングが必要。
 *
 * 将来 #1036 系列で /generate-code skill template にも反映候補。
 *
 * Fixed in ISSUE #1037 (docker maven smoke build + Spring Security 実機検証).
 */
@Controller
public class LoginController {

    @GetMapping("/login")
    public String login() {
        return "login";
    }
}
