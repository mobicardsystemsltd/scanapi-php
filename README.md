# SCAN API

The SCAN API provides a complete UI solution for card scanning using a device camera.  
It enables card capture directly from a web browser using either a laptop or mobile device.

---

## Overview

This solution allows you to test card scanning by hosting a simple web application on your own server.  
The application accesses the device camera, scans a card, and displays the captured card details on the screen.

---

## Getting Started

### 1. Setup

1. Clone the source code repository.
2. Move the project folder to your web server directory.

For example, in a local development environment:
http://localhost/scanapi-php-main/index.php


Opening this URL will load the card capture page.

---

### 2. Usage

- The page can be hosted on:
  - A **local machine** using a laptop camera
  - A **private/public server**, allowing access from a **mobile device** and use of the mobile camera
- When the page loads, your browser may request permission to access the camera
- Hold a sample card in front of the camera
- The scan takes a few seconds, after which the card details will be displayed on the screen

---

### 3. Sample Code & Credentials

The sample application consists of two files:

- `index.php`
- `mobiscan_view_file.html`

The following parameters in `index.php` are **test credentials**.  
Replace them with your **own merchant credentials** after signing up for an account.

```php
$mobicard_merchant_id = "4";
$mobicard_api_key = "YmJkOGY0OTZhMTU2ZjVjYTIyYzFhZGQyOWRiMmZjMmE2ZWU3NGIxZWM3ZTBiZSJ9";
$mobicard_secret_key = "NjIwYzEyMDRjNjNjMTdkZTZkMjZhOWNiYjIxNzI2NDQwYzVmNWNiMzRhMzBjYSJ9";
```

Notes

#### 1.Ensure your server supports HTTPS when deploying publicly, as camera access is restricted on insecure origins

#### 2.Camera permission is required for the scan to work

#### 3.Scanning performance may vary depending on lighting and camera quality
