package com.example;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/notifications")
public class NotificationController {

    @PostMapping("/send")
    public void send(@RequestBody String request) {
    }

    @GetMapping("/preferences/{customerId}")
    public String getPreferences(@PathVariable String customerId) {
        return "{}";
    }
}
