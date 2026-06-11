package com.example;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/loyalty")
public class LoyaltyController {

    @GetMapping("/discount")
    public double getDiscount(@RequestParam String customerId,
                              @RequestParam double orderTotal) {
        return 0.05;
    }

    @PostMapping("/points")
    public void awardPoints(@RequestBody String event) {
    }
}
