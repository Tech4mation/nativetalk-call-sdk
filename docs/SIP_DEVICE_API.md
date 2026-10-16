# SIP Device API Documentation

Complete API reference for managing SIP devices (VoIP credentials) for users in your Nativetalk CRM. Includes endpoint specifications, request/response examples, and testing instructions.

## Prerequisites

1. **Base URL**: `https://{company-subdomain}.nativetalkcrm.com` (example: `https://tech4mation.nativetalkcrm.com`)
2. **API Key**: Available in your Nativetalk CRM portal under Settings → Developer Settings → API Keys
3. **User ID**: ID of the user you want to assign a SIP device to

## Authentication

All requests require the `X-API-Key` header:

```
X-API-Key: your-api-key-here
```

Obtain your API key from your Nativetalk CRM portal: Settings → Developer Settings → API Keys.

---

## Understanding SIP Devices

When you create a SIP device, the API provisions it on the VoIP infrastructure and returns credentials for making calls. Here's what each key field means:

- **`device_id`** — Unique identifier for the device (e.g., "593"). This is assigned by the VoIP infrastructure when the device is created. Use this to reference the device in API calls (e.g., `/api/sip/devices/593/`).

- **`username`** — Numeric SIP username for authentication (e.g., "2611655010"). This is the username you'd enter in a VoIP softphone or device to authenticate. Automatically generated from the user ID or external user ID.

- **`password`** — SIP authentication password. Either auto-generated (secure random string) or provided during device creation.

- **`sip_uri`** — Complete SIP URI for making/receiving calls: `sip:{username}@{sip_domain}`. Use this to dial or be dialed.

- **`sip_domain`** — Company-specific SIP domain (e.g., "nativetalkdemo33.nativetalk.io"). This is where the SIP server is located.

- **`caller_number`** — The DID (Direct Inward Dial) number associated with the company. Used as the caller ID for outbound calls.

**Example workflow:**
```
VoIP Client Connection:
  Server: sip_domain (e.g., nativetalkdemo33.nativetalk.io)
  Username: username (e.g., 2611655010)
  Password: password (e.g., SecureP@ss123)
  
Make a call:
  Dial to: sip_uri (e.g., sip:2611655010@nativetalkdemo33.nativetalk.io)
```

---

## Endpoints

### 1. List SIP Devices

**Endpoint**: `GET /api/sip/devices/`

**Description**: Retrieve all SIP devices for your company.

**Headers**:
```
X-API-Key: your-api-key-here
```

**Query Parameters** (optional):
- `status` — Filter by status: `active` or `inactive`
- `search` — Search by user ID or display name
- `limit` — Results per page (default: 50, max: 500)
- `offset` — Pagination offset (default: 0)

**Example Requests**:

```
GET /api/sip/devices/
GET /api/sip/devices/?status=active
GET /api/sip/devices/?search=facilitybills
GET /api/sip/devices/?limit=10&offset=0
```

**Example Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "count": 2,
    "limit": 50,
    "offset": 0,
    "devices": [
      {
        "device_id": "593",
        "user_id": null,
        "external_user_id": "fb_emp_12346",
        "username": "2611655010",
        "display_name": "John Doe",
        "status": "active",
        "sip_uri": "sip:2611655010@nativetalkdemo33.nativetalk.io",
        "sip_domain": "nativetalkdemo33.nativetalk.io",
        "created_at": "2026-06-25T10:30:00Z"
      },
      {
        "device_id": "594",
        "user_id": 124,
        "external_user_id": null,
        "username": "124",
        "display_name": "Jane Smith",
        "status": "inactive",
        "sip_uri": "sip:124@nativetalkdemo33.nativetalk.io",
        "sip_domain": "nativetalkdemo33.nativetalk.io",
        "created_at": "2026-06-25T11:00:00Z"
      }
    ]
  }
}
```

---

### 2. Create SIP Device

**Endpoint**: `POST /api/sip/devices/`

**Description**: Create a new SIP device for a user. Device includes auto-generated credentials.

**Headers**:
```
X-API-Key: your-api-key-here
Content-Type: application/json
```

**Request Body** (two options):

*Option A — CRM User*:
```json
{
  "user_id": 123,
  "display_name": "John Doe Office Phone",
  "password": "optional-password-or-auto-generate",
  "status": "active"
}
```

*Option B — External System User*:
```json
{
  "external_user_id": "fb_emp_12345",
  "display_name": "John Doe Office Phone",
  "password": "optional-password-or-auto-generate",
  "status": "active"
}
```

**Field Details**:
- `user_id` *(optional, integer)* — ID of a CRM user to assign the device to. Either `user_id` or `external_user_id` must be provided.
- `external_user_id` *(optional, string)* — External system user identifier from your own application. Use this if the user doesn't exist in the CRM. Can be any string value (e.g., employee ID, email, UUID, username, or custom reference). Either `user_id` or `external_user_id` must be provided.
- `display_name` *(optional, string)* — Friendly name for the device; defaults to user's full name (if using `user_id`) or external user ID (if using `external_user_id`)
- `password` *(optional, string)* — Custom SIP password (min 8 chars); if omitted, a secure password is auto-generated
- `status` *(optional, string)* — Device status: `active` (default) or `inactive`

**Note on `external_user_id`:**
The `external_user_id` field accepts any string identifier from your system. The API will automatically generate a numeric SIP username from this identifier. Examples:
- Database user ID: `"emp_12345"` or `"12345"`
- Email address: `"john.smith@company.com"`
- Username: `"jsmith"`
- UUID: `"550e8400-e29b-41d4-a716-446655440000"`
- Custom reference: `"DEPT-2026-001"`

Choose whichever identifier uniquely identifies the user in your system. The API stores the external_user_id as-is for device ownership tracking and provisions the device with an auto-generated numeric SIP username.

**Example Request (CRM User)**:
```json
{
  "user_id": 123,
  "display_name": "John Doe Office Phone"
}
```

**Example Request (External User)**:
```json
{
  "external_user_id": "fb_emp_12345",
  "display_name": "John Doe Office Phone"
}
```

**Example Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "device_id": "593",
    "user_id": null,
    "external_user_id": "fb_emp_12346",
    "username": "2611655010",
    "password": "SecureP@ss123",
    "display_name": "John Doe Office Phone",
    "status": "active",
    "sip_uri": "sip:2611655010@nativetalkdemo33.nativetalk.io",
    "sip_domain": "nativetalkdemo33.nativetalk.io",
    "caller_number": "+1234567890",
    "created_at": "2026-06-25T10:30:00Z",
    "updated_at": "2026-06-25T10:30:00Z"
  }
}
```

**Understanding the response fields:**
- **`device_id`** — Unique SIP device ID (used to identify the device). Automatically assigned when the device is created.
- **`username`** — Numeric SIP username for authentication (e.g., "2611655010"). Automatically generated from the user ID or external user ID.
- **`password`** — SIP password for authentication. Either auto-generated (secure random) or provided during creation.
- **`sip_uri`** — Complete SIP URI for making/receiving calls: `sip:{username}@{sip_domain}`
- **`sip_domain`** — Company's unique SIP domain (e.g., "nativetalkdemo33.nativetalk.io"). Retrieved from company configuration.
- **`caller_number`** — The company's assigned DID (Direct Inward Dial) number. Used as caller ID for outbound calls.

**Device provisioning:**
- The SIP device is automatically provisioned on the VoIP infrastructure during this API call
- If provisioning fails, the device creation returns a 500 error
- Both CRM users and external system users are supported

**Error Responses**:

*409 Conflict* — Device already exists for this user:
```json
{
  "success": false,
  "error": "A device for this user already exists",
  "code": "USER_ID_EXISTS",
  "details": {
    "existing_device_id": "sip_123"
  }
}
```

*404 Not Found* — CRM user not found (only when using `user_id`):
```json
{
  "success": false,
  "error": "User not found",
  "code": "NOT_FOUND"
}
```

*400 Bad Request* — Neither `user_id` nor `external_user_id` provided:
```json
{
  "success": false,
  "error": "Invalid input",
  "code": "INVALID_INPUT",
  "details": {
    "non_field_errors": ["Either user_id or external_user_id must be provided"]
  }
}
```

*400 Bad Request* — Password too short:
```json
{
  "success": false,
  "error": "Invalid input",
  "code": "INVALID_INPUT",
  "details": {
    "password": ["Password must be at least 8 characters"]
  }
}
```

*400 Bad Request* — Company PBX not configured:
```json
{
  "success": false,
  "error": "Company PBX not configured",
  "code": "PBX_NOT_CONFIGURED"
}
```

*400 Bad Request* — No DID assigned to company:
```json
{
  "success": false,
  "error": "No DID number assigned to company",
  "code": "NO_DID_ASSIGNED"
}
```

*500 Internal Server Error* — PBX provisioning failed:
```json
{
  "success": false,
  "error": "Failed to create device on PBX",
  "code": "PBX_ERROR"
}
```

---

### 3. Get SIP Device

**Endpoint**: `GET /api/sip/devices/{device_id}/`

**Description**: Retrieve details for a specific SIP device.

**Headers**:
```
X-API-Key: your-api-key-here
```

**Path Parameters**:
- `device_id` — The device ID to retrieve

**Example Request**:
```
GET /api/sip/devices/593/
```

**Example Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "device_id": "593",
    "user_id": null,
    "external_user_id": "fb_emp_12346",
    "username": "2611655010",
    "password": "SecureP@ss123",
    "display_name": "John Doe Office Phone",
    "status": "active",
    "sip_uri": "sip:2611655010@nativetalkdemo33.nativetalk.io",
    "sip_domain": "nativetalkdemo33.nativetalk.io",
    "caller_number": "+1234567890",
    "created_at": "2026-06-25T10:30:00Z",
    "updated_at": "2026-06-25T10:30:00Z"
  }
}
```

**Error Response** (404 Not Found):
```json
{
  "success": false,
  "error": "Not found."
}
```

---

### 4. Update SIP Device

**Endpoint**: `PATCH /api/sip/devices/{device_id}/`

**Description**: Update device metadata (display name or status). To change the password, use the [Reset Password endpoint](#6-reset-sip-device-password) instead.

**Headers**:
```
X-API-Key: your-api-key-here
Content-Type: application/json
```

**Request Body** (partial update):
```json
{
  "display_name": "John's Mobile Phone",
  "status": "inactive"
}
```

**Updatable Fields**:
- `display_name` — Friendly name for the device
- `status` — Device status: `active` or `inactive` (activate/deactivate the device)

**Note:** Password changes must be handled via the [Reset Password endpoint](#6-reset-sip-device-password) for security reasons. This keeps authentication changes separate and auditable.

**Example Request**:
```json
{
  "display_name": "John's Mobile Phone"
}
```

**Example Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "device_id": "593",
    "user_id": 123,
    "external_user_id": null,
    "username": "123",
    "password": "Th!sIsGenerated",
    "display_name": "John's Mobile Phone",
    "status": "active",
    "sip_uri": "sip:123@nativetalkdemo33.nativetalk.io",
    "sip_domain": "nativetalkdemo33.nativetalk.io",
    "caller_number": "+1234567890",
    "created_at": "2026-06-25T10:30:00Z",
    "updated_at": "2026-06-25T10:31:00Z"
  }
}
```

---

### 5. Delete SIP Device

**Endpoint**: `DELETE /api/sip/devices/{device_id}/`

**Description**: Permanently delete a SIP device.

**Headers**:
```
X-API-Key: your-api-key-here
```

**Example Request**:
```
DELETE /api/sip/devices/593/
```

**Example Response** (204 No Content):
```
[Empty body, just status code 204]
```

**Error Response** (404 Not Found):
```json
{
  "success": false,
  "error": "Not found."
}
```

---

### 6. Reset SIP Device Password

**Endpoint**: `POST /api/sip/devices/{device_id}/reset-password/`

**Description**: Reset the SIP device password (auto-generate or provide custom).

**Headers**:
```
X-API-Key: your-api-key-here
Content-Type: application/json
```

**Request Body** (one of):

*Option A — Auto-generate*:
```json
{
  "generate": true
}
```

*Option B — Provide custom password*:
```json
{
  "password": "MyNewPassword123!"
}
```

**Field Details**:
- `generate` *(optional, boolean)* — If true, auto-generate a secure password
- `password` *(optional, string)* — Custom password (min 8 chars). Either this or `generate` must be provided.

**Example Request** (auto-generate):
```json
{
  "generate": true
}
```

**Example Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "device_id": "sip_123",
    "password": "NewGeneratedPassword123",
    "updated_at": "2026-06-25T10:35:00Z",
    "message": "Password updated successfully"
  }
}
```

**Error Responses**:

*400 Bad Request* — No password or generate flag:
```json
{
  "success": false,
  "error": "Invalid input",
  "code": "INVALID_INPUT",
  "details": {
    "non_field_errors": ["Provide either 'password' or set 'generate' to true"]
  }
}
```

*400 Bad Request* — Password too short:
```json
{
  "success": false,
  "error": "Invalid input",
  "code": "INVALID_INPUT",
  "details": {
    "password": ["Password must be at least 8 characters"]
  }
}
```

---

### 7. Register a Phone for Call Wake-ups

**Endpoint**: `POST /api/sip/devices/{device_id}/push-token/`

**Description**: Tell us which phone to wake when a call comes in for this SIP
device.

A phone that is asleep, or an app that has been swiped away, has no open SIP
connection, so a call cannot reach it directly. We wake the app with a push
first, and then offer the call. To do that we need the phone's push token. Your
app gets the token from iOS or Android, sends it to your backend, and your
backend sends it here, for the SIP device that person signs in with.

Call it every time the app starts, and whenever the operating system issues a
new token. It is safe to repeat. We keep one phone per SIP device per platform,
so a new token replaces the old one.

Before an iPhone can be woken, we also need your app's push key. See
[VoIP Push Setup](voip-push-setup.md).

**Headers**:
```
X-API-Key: your-api-key-here
Content-Type: application/json
```

**Request Body**:
```json
{
  "token": "4f1c2e8a9b...",
  "platform": "ios",
  "environment": "sandbox"
}
```

**Field Details**:
- `token` *(required, string)* — The push token. On iOS this is the PushKit
  VoIP token as a hex string. On Android it is the Firebase token.
- `platform` *(optional, string)* — `ios` or `android`. Defaults to `ios`.
- `provider` *(optional, string)* — `apns` or `fcm`. Worked out from
  `platform`, so you only need to send one of the two.
- `bundle_id` *(optional, string)* — Leave it out. We push to the app named on
  the push key you sent us. Send it only if that key covers more than one of
  your apps, and then it must be the real bundle ID of the app on this phone.
  `bundleId` is also accepted.
- `environment` *(optional, string)* — `sandbox` for a build signed with a
  development profile, which includes anything run from Xcode. `production` for
  TestFlight and the App Store. Defaults to `production`, so send it for every
  development build. Ignored on Android.

**Example Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "registered": true,
    "device_id": "593",
    "platform": "ios",
    "provider": "apns",
    "environment": "sandbox"
  }
}
```

If your company's calls do not use push wake-ups, the request still succeeds,
with `"registered": false` and a message saying so. Nothing needs fixing on
your side.

**Error Responses**:

*400 Bad Request* — No token, or a platform and provider that do not match,
such as `ios` with `fcm`. An iPhone token sent through Firebase never arrives.
```json
{
  "success": false,
  "error": "Invalid input",
  "code": "INVALID_INPUT",
  "details": {
    "token": ["This field is required."]
  }
}
```

*404 Not Found* — `NO_DEVICE`: the SIP device exists in your account but is not
on the phone system, so no call will ever be offered to it. Contact us.

---

### 8. Stop Waking a Phone

**Endpoint**: `DELETE /api/sip/devices/{device_id}/push-token/`

**Description**: Stop waking a phone for calls. Call it when the person signs
out of your app, so their phone does not keep ringing for someone else's calls.

**Headers**:
```
X-API-Key: your-api-key-here
Content-Type: application/json
```

**Request Body**:
```json
{
  "token": "4f1c2e8a9b..."
}
```

If your HTTP client cannot send a body with `DELETE`, send the token in the
query instead: `DELETE /api/sip/devices/{device_id}/push-token/?token=4f1c2e8a9b...`

**Response**: `204 No Content`. A token we never had also returns `204`, since
it is already in the state you asked for.

*400 Bad Request* — No token was sent.

---

## Rate Limiting

The API enforces rate limits per company to prevent abuse:

- **List devices**: 1000 requests/hour
- **Create device**: 100 requests/hour
- **Update device**: 500 requests/hour
- **Delete device**: 50 requests/hour
- **Reset password**: 200 requests/hour

When a rate limit is exceeded, the API returns `429 Too Many Requests`. Implement exponential backoff in your client to handle rate-limited responses gracefully.

---

## Troubleshooting

### 401 Unauthorized

**Cause**: Missing or invalid API key  
**Fix**: 
- Verify the `X-API-Key` header is present and correct
- Check that the key is active in Settings → Developer Settings

### 403 Forbidden

**Cause**: Insufficient permissions  
**Fix**:
- Ensure your user account has admin rights
- Contact your company admin if needed

### 404 Not Found

**Cause**: Device or user does not exist, or belongs to different company  
**Fix**:
- Verify the `device_id` and `user_id` are correct
- Check that both resources belong to your company

### 409 Conflict

**Cause**: User already has an active SIP device  
**Fix**:
- Each user can only have one device at a time
- Delete or reset the existing device first

### 429 Too Many Requests

**Cause**: Rate limit exceeded  
**Fix**:
- Wait a minute before retrying
- Implement exponential backoff in your integration

### The app rings while open, but not when asleep or swiped away

**Cause**: The phone was never registered for wake-ups, or Apple refuses our
push to your app  
**Fix**:
- Check the app sends its push token to your backend, and your backend calls
  `POST /api/sip/devices/{device_id}/push-token/` with it. The response must say
  `"registered": true`.
- For iPhones, check the `environment` you send matches the build on the phone.
- Work through [VoIP Push Setup](voip-push-setup.md), which covers the key we
  need from you before any iPhone can be woken.

---
