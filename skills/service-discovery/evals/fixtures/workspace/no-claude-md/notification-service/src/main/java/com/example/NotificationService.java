package com.example;

import org.springframework.stereotype.Service;

@Service
public class NotificationService {

    public void notifyOrderCreated(OrderCreatedEvent event) {
        // send notification for the created order
    }
}
