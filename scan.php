<?php

// Mandatory claims

// You may copy paste the full sample code provided below, on this page, under the code section titled : (Sample Code : Full PHP Implementation (Method 1))

$mobicard_version = "2.0";
$mobicard_mode = "LIVE"; // production
$mobicard_merchant_id = "";
$mobicard_api_key = "";
$mobicard_secret_key = "";

$mobicard_token_id = abs(rand(1000000,1000000000));
$mobicard_token_id = "$mobicard_token_id";

$mobicard_txn_reference = abs(rand(1000000,1000000000));
$mobicard_txn_reference = "$mobicard_txn_reference";

$mobicard_service_id = "20000"; // Scan Card service ID
$mobicard_service_type = "1"; // Use '1' for CARD SCAN METHOD 1

$mobicard_extra_data = "your_custom_data_here_will_be_returned_as_is";

// Create JWT Header
$mobicard_jwt_header = [
    "typ" => "JWT",
    "alg" => "HS256"
];
$mobicard_jwt_header = rtrim(strtr(base64_encode(json_encode($mobicard_jwt_header)), '+/', '-_'), '=');

// Create JWT Payload
$mobicard_jwt_payload = array(
    "mobicard_version" => "$mobicard_version",
    "mobicard_mode" => "$mobicard_mode",
    "mobicard_merchant_id" => "$mobicard_merchant_id",
    "mobicard_api_key" => "$mobicard_api_key",
    "mobicard_service_id" => "$mobicard_service_id",
    "mobicard_service_type" => "$mobicard_service_type",
    "mobicard_token_id" => "$mobicard_token_id",
    "mobicard_txn_reference" => "$mobicard_txn_reference",
    "mobicard_extra_data" => "$mobicard_extra_data"
);

$mobicard_jwt_payload = rtrim(strtr(base64_encode(json_encode($mobicard_jwt_payload)), '+/', '-_'), '=');

// Generate Signature
$header_payload = $mobicard_jwt_header . '.' . $mobicard_jwt_payload;
$mobicard_jwt_signature = rtrim(strtr(base64_encode(hash_hmac('sha256', $header_payload, $mobicard_secret_key, true)), '+/', '-_'), '=');

// Create Final JWT
$mobicard_auth_jwt = "$mobicard_jwt_header.$mobicard_jwt_payload.$mobicard_jwt_signature";

// Request Access Token
$mobicard_request_access_token_url = "https://mobicardsystems.com/api/v1/card_scan";

$mobicard_curl_post_data = array('mobicard_auth_jwt' => $mobicard_auth_jwt);

$curl_mobicard = curl_init();
curl_setopt($curl_mobicard, CURLOPT_URL, $mobicard_request_access_token_url);
curl_setopt($curl_mobicard, CURLOPT_RETURNTRANSFER, true);
curl_setopt($curl_mobicard, CURLOPT_POST, true);
curl_setopt($curl_mobicard, CURLOPT_POSTFIELDS, json_encode($mobicard_curl_post_data));
curl_setopt($curl_mobicard, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($curl_mobicard, CURLOPT_SSL_VERIFYPEER, false);
$mobicard_curl_response = curl_exec($curl_mobicard);
curl_close($curl_mobicard);

// Parse Response
$mobicard_curl_response = json_decode($mobicard_curl_response, true);

var_dump($mobicard_curl_response);

if($mobicard_curl_response && $mobicard_curl_response['status_code'] == "200") {
    $status_code = $mobicard_curl_response['status_code'];
    $status_message = $mobicard_curl_response['status_message'];
    $mobicard_transaction_access_token = $mobicard_curl_response['mobicard_transaction_access_token'];
    $mobicard_token_id = $mobicard_curl_response['mobicard_token_id'];
    $mobicard_txn_reference = $mobicard_curl_response['mobicard_txn_reference'];
    $mobicard_scan_card_url = $mobicard_curl_response['mobicard_scan_card_url'];
    
    // These variables are now available for the UI script
    // $mobicard_transaction_access_token, $mobicard_token_id, $mobicard_scan_card_url
} else {
    // Handle error
    var_dump($mobicard_curl_response);
    exit();
}
