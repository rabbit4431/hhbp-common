package com.example;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class DiscountService {

    public BigDecimal calculateDiscount(BigDecimal amount, String tier) {
        if ("gold".equalsIgnoreCase(tier) && amount.compareTo(new BigDecimal("100")) > 0) {
            return amount.multiply(new BigDecimal("0.05"));
        }
        return BigDecimal.ZERO;
    }
}
