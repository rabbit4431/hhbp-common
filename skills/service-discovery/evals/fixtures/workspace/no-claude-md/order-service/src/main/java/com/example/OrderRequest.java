package com.example;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

public class OrderRequest {

    private String customerId;
    private String item;
    private int quantity;

    @Positive(message = "amount must be positive")
    private double amount;

    @Pattern(regexp = "bronze|silver|gold", message = "tier must be one of: bronze, silver, gold")
    private String tier;

    public String getCustomerId() { return customerId; }
    public void setCustomerId(String customerId) { this.customerId = customerId; }

    public String getItem() { return item; }
    public void setItem(String item) { this.item = item; }

    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }

    public double getAmount() { return amount; }
    public void setAmount(double amount) { this.amount = amount; }

    public String getTier() { return tier; }
    public void setTier(String tier) { this.tier = tier; }
}
