package com.example;

import java.math.BigDecimal;

public class OrderDTO {
    private Long id;
    private String productId;
    private int quantity;
    private String status;
    private BigDecimal discount;

    public OrderDTO() {}

    public OrderDTO(Long id, String productId, int quantity, String status, BigDecimal discount) {
        this.id = id;
        this.productId = productId;
        this.quantity = quantity;
        this.status = status;
        this.discount = discount;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getProductId() { return productId; }
    public void setProductId(String productId) { this.productId = productId; }

    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public BigDecimal getDiscount() { return discount; }
    public void setDiscount(BigDecimal discount) { this.discount = discount; }
}
