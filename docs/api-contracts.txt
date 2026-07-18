# API Contracts

## Passion Cosmetic E-Commerce Platform

**Document version:** 1.0  
**Status:** Implementation contract baseline  
**Documentation language:** English  
**Application UI language:** French only  
**API style:** Versioned REST/JSON  
**Backend:** Laravel modular monolith  
**Consumers:** Server-rendered storefront, Vue storefront islands, Vue back-office SPA  
**Deployment:** Deployment-neutral; valid for both Docker and non-Docker VPS plans  
**Related documents:** `prd.md`, `roles-authorization-matrix.md`, `system-design.md`, `security-rules.md`

---

## 1. Purpose

This document defines the HTTP contracts that Codex and human developers must follow when implementing the Passion Cosmetic platform.

It specifies:

- API namespaces and host boundaries
- Authentication and CSRF behavior
- Request and response conventions
- Public checkout, search, and complaint contracts
- Admin product, category, order, complaint, content, promotion, settings, user, audit, and Meta contracts
- Validation and error envelopes
- Pagination, filtering, sorting, and concurrency behavior
- File-upload contracts
- Idempotency and retry requirements
- Role access rules
- Security-sensitive response redaction
- Stable enums and machine-readable error codes

This document is the source of truth for API behavior. Controllers, Form Requests, services, Vue clients, tests, and generated OpenAPI documentation must conform to it.

---

## 2. Scope and Boundaries

### 2.1 Included

The API covers:

- Guest storefront interactions that require server data
- Authoritative cart quotation
- Guest Cash-on-Delivery checkout
- Complaint submission
- Back-office authentication
- Product and category management
- Product variants and media
- Order management and status transitions
- Inventory adjustments through approved workflows
- Promo codes
- Checkout-field configuration
- Storefront content and static pages
- Shipping and store settings
- User management
- Audit-log access
- Meta Pixel/CAPI configuration and diagnostics
- Dashboard analytics

### 2.2 Excluded

The initial API does not include:

- Customer registration or authentication
- Online payments
- Customer order-history accounts
- Product reviews
- Wishlists
- Real-time APIs, WebSockets, or polling feeds
- Public GraphQL
- Multi-vendor APIs
- Mobile-app-specific APIs
- External courier integration
- Email, SMS, or WhatsApp notification APIs
- Public write access to products or content

---

## 3. Host and Namespace Conventions

### 3.1 Public storefront host

Example:

```text
https://passioncosmetic.com
```

Public JSON endpoints:

```text
https://passioncosmetic.com/api/v1/public/*
```

The public catalogue is primarily rendered as HTML by Laravel. JSON is used only where interactivity requires it.

### 3.2 Back-office host

Preferred:

```text
https://admin.passioncosmetic.com
```

Admin JSON endpoints:

```text
https://admin.passioncosmetic.com/api/v1/admin/*
```

A same-domain `/admin` deployment is permitted, but the route contracts remain unchanged.

### 3.3 API versioning

All application JSON endpoints use:

```text
/api/v1/
```

Breaking changes require a new major namespace such as `/api/v2/`.

Adding optional response fields is non-breaking. Removing or changing the meaning or type of an existing field is breaking.

---

## 4. General HTTP Conventions

### 4.1 Content types

JSON requests:

```http
Content-Type: application/json
Accept: application/json
```

File uploads:

```http
Content-Type: multipart/form-data
Accept: application/json
```

### 4.2 Field naming

All JSON fields use `snake_case`.

Examples:

```json
{
  "public_id": "01J...",
  "regular_price_millimes": 12500,
  "is_active": true
}
```

### 4.3 Dates and times

All API timestamps use ISO 8601 UTC:

```text
2026-07-18T14:35:22Z
```

The French UI displays dates in the `Africa/Tunis` timezone.

Date-only query parameters use:

```text
YYYY-MM-DD
```

### 4.4 Money

All authoritative monetary values are unsigned integer millimes.

```text
1 TND = 1000 millimes
```

Example:

```json
{
  "total_millimes": 98500,
  "display_total": "98,500 TND"
}
```

`display_*` fields may be returned for convenience but are never accepted as authoritative input.

Clients must not submit trusted prices, discounts, shipping fees, or totals.

### 4.5 Public identifiers

External contracts use:

- ULIDs
- UUIDs
- Stable slugs
- Signed opaque tokens

Internal numeric primary keys must never appear in public URLs or normal API resources.

### 4.6 Boolean fields

Booleans are real JSON booleans:

```json
{
  "is_active": true
}
```

The API must not return `0`, `1`, `"true"`, or `"false"` for boolean fields.

### 4.7 Null handling

Optional absent values use JSON `null`.

Empty strings must not be used as substitutes for missing optional values unless the field is explicitly a user-entered text field whose empty string is meaningful.

### 4.8 Request IDs

Every response should include:

```http
X-Request-ID: <uuid>
```

If the incoming request provides a valid `X-Request-ID`, Laravel may preserve it; otherwise it generates one.

The request ID may be included in error responses and Sentry context.

### 4.9 Accepted methods

- `GET`: read
- `POST`: create or execute an explicit command
- `PATCH`: partial update
- `PUT`: full replacement only where explicitly defined
- `DELETE`: safe removal or archive only where permitted

Orders, audit logs, and protected historical records are never hard-deleted through an API.

---

## 5. Standard Response Envelopes

### 5.1 Single-resource success

```json
{
  "data": {
    "public_id": "01JABC..."
  },
  "meta": {
    "request_id": "827ed9dc-3ae0-4d32-b226-d541c5a3364c"
  }
}
```

### 5.2 Collection success

```json
{
  "data": [],
  "links": {
    "first": "https://admin.example.com/api/v1/admin/products?page=1",
    "last": "https://admin.example.com/api/v1/admin/products?page=4",
    "prev": null,
    "next": "https://admin.example.com/api/v1/admin/products?page=2"
  },
  "meta": {
    "current_page": 1,
    "from": 1,
    "last_page": 4,
    "per_page": 25,
    "to": 25,
    "total": 83,
    "request_id": "827ed9dc-3ae0-4d32-b226-d541c5a3364c"
  }
}
```

### 5.3 Command success without a returned resource

```json
{
  "data": null,
  "message": "Action terminée avec succès.",
  "meta": {
    "request_id": "827ed9dc-3ae0-4d32-b226-d541c5a3364c"
  }
}
```

### 5.4 Error envelope

```json
{
  "error": {
    "code": "ORDER_NOT_EDITABLE",
    "message": "Cette commande ne peut plus être modifiée.",
    "details": null
  },
  "meta": {
    "request_id": "827ed9dc-3ae0-4d32-b226-d541c5a3364c"
  }
}
```

### 5.5 Validation-error envelope

HTTP `422`:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Certaines informations sont invalides.",
    "details": {
      "customer_phone": [
        "Le numéro de téléphone est obligatoire."
      ],
      "items.0.quantity": [
        "La quantité doit être au moins égale à 1."
      ]
    }
  },
  "meta": {
    "request_id": "827ed9dc-3ae0-4d32-b226-d541c5a3364c"
  }
}
```

French messages are intended for the French UI. Machine behavior must depend on `error.code`, not translated text.

---

## 6. HTTP Status Codes

| Status | Meaning |
|---|---|
| `200` | Successful read, update, or command |
| `201` | Resource created |
| `202` | Asynchronous operation accepted |
| `204` | Successful deletion/archive with no body |
| `302` | Server-rendered redirect, not a JSON API response |
| `400` | Malformed or semantically unusable request |
| `401` | Authentication required or invalid session |
| `403` | Authenticated but forbidden |
| `404` | Resource not found or intentionally concealed |
| `409` | State conflict, stale version, duplicate idempotency key with different payload, stock race |
| `410` | Expired signed public token where applicable |
| `413` | Uploaded payload too large |
| `415` | Unsupported media type |
| `422` | Validation failure |
| `423` | Resource temporarily locked by protected workflow, when needed |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |
| `502` | Upstream service error where synchronously surfaced |
| `503` | Service temporarily unavailable |

---

## 7. Stable Error Codes

The following error codes are part of the contract.

### 7.1 General

- `VALIDATION_FAILED`
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `RESOURCE_NOT_FOUND`
- `METHOD_NOT_ALLOWED`
- `RATE_LIMITED`
- `CONFLICT`
- `INTERNAL_ERROR`
- `SERVICE_UNAVAILABLE`
- `INVALID_REQUEST_ID`
- `UNSUPPORTED_MEDIA_TYPE`
- `PAYLOAD_TOO_LARGE`

### 7.2 Authentication and users

- `INVALID_CREDENTIALS`
- `ACCOUNT_DISABLED`
- `PASSWORD_CONFIRMATION_REQUIRED`
- `PASSWORD_CONFIRMATION_FAILED`
- `FORCE_PASSWORD_CHANGE_REQUIRED`
- `LAST_SUPER_ADMIN_PROTECTED`
- `SELF_PROTECTION_RULE`
- `EMAIL_ALREADY_USED`
- `USER_ROLE_INVALID`

### 7.3 Catalogue and inventory

- `PRODUCT_INACTIVE`
- `PRODUCT_UNAVAILABLE`
- `CATEGORY_INACTIVE`
- `CATEGORY_IN_USE`
- `PRODUCT_IN_USE`
- `VARIANT_REQUIRED`
- `VARIANT_NOT_FOUND`
- `VARIANT_INACTIVE`
- `VARIANT_COMBINATION_DUPLICATE`
- `INSUFFICIENT_STOCK`
- `STOCK_CONFLICT`
- `INVALID_PROMOTIONAL_PRICE`
- `INVALID_VARIANT_MODE_SWITCH`
- `SLUG_ALREADY_USED`

### 7.4 Cart, checkout, and promotions

- `CART_ITEM_INVALID`
- `CART_UPDATED`
- `CHECKOUT_IDEMPOTENCY_REQUIRED`
- `CHECKOUT_IDEMPOTENCY_CONFLICT`
- `CHECKOUT_FIELDS_CHANGED`
- `PROMO_CODE_INVALID`
- `PROMO_CODE_INACTIVE`
- `PROMO_CODE_NOT_STARTED`
- `PROMO_CODE_EXPIRED`
- `PROMO_CODE_USAGE_EXHAUSTED`
- `PROMO_CODE_MINIMUM_NOT_REACHED`
- `PROMO_CODE_FIELD_HIDDEN`
- `ORDER_CREATION_FAILED`

### 7.5 Orders

- `ORDER_NOT_EDITABLE`
- `ORDER_VERSION_CONFLICT`
- `ORDER_TRANSITION_INVALID`
- `ORDER_ALREADY_IN_STATUS`
- `ORDER_STOCK_ALREADY_RESTORED`
- `RETURN_RESTOCK_DECISION_REQUIRED`
- `ORDER_DELETE_FORBIDDEN`

### 7.6 Complaints and uploads

- `COMPLAINT_ATTACHMENT_INVALID`
- `COMPLAINT_ATTACHMENT_NOT_FOUND`
- `COMPLAINT_TRANSITION_INVALID`
- `COMPLAINT_ORDER_REFERENCE_INVALID`

### 7.7 Meta

- `META_TRACKING_DISABLED`
- `META_CONFIGURATION_INVALID`
- `META_CONNECTION_TEST_FAILED`
- `META_PASSWORD_CONFIRMATION_REQUIRED`
- `META_CONFIRMATION_PHRASE_INVALID`
- `META_PURCHASE_ALREADY_EXISTS`
- `META_EVENT_NOT_RETRYABLE`
- `META_EVENT_ALREADY_SUCCEEDED`
- `META_SECRET_REDACTED`
- `META_TRIGGER_CHANGE_CONFLICT`

---

## 8. Authentication and Session Contract

### 8.1 Authentication model

Only back-office users authenticate.

Use:

- Laravel Sanctum cookie-based authentication
- Redis-backed sessions
- CSRF protection
- Secure, HttpOnly cookies
- Session regeneration after login
- Backend role enforcement

### 8.2 CSRF initialization

```http
GET /sanctum/csrf-cookie
```

Response:

```http
204 No Content
```

The Vue admin client must call this before the first state-changing authentication request.

### 8.3 Login

```http
POST /api/v1/admin/auth/login
```

Access: Public, rate-limited.

Request:

```json
{
  "email": "owner@example.com",
  "password": "secret-password",
  "remember": false
}
```

Success `200`:

```json
{
  "data": {
    "user": {
      "public_id": "01JUSER...",
      "name": "Owner",
      "email": "owner@example.com",
      "role": "super_admin",
      "is_active": true,
      "force_password_change": false,
      "last_login_at": "2026-07-18T14:35:22Z"
    }
  },
  "meta": {
    "request_id": "..."
  }
}
```

Failure:

- `401 INVALID_CREDENTIALS`
- `403 ACCOUNT_DISABLED`
- `429 RATE_LIMITED`

The response must never reveal whether an unknown email or wrong password caused failure.

### 8.4 Current user

```http
GET /api/v1/admin/me
```

Access: Authenticated Admin or Super Admin.

Response:

```json
{
  "data": {
    "public_id": "01JUSER...",
    "name": "Owner",
    "email": "owner@example.com",
    "role": "super_admin",
    "is_active": true,
    "force_password_change": false,
    "last_login_at": "2026-07-18T14:35:22Z",
    "capabilities": [
      "products.manage",
      "orders.manage",
      "meta.manage",
      "users.manage",
      "settings.manage",
      "audit.view"
    ]
  },
  "meta": {
    "request_id": "..."
  }
}
```

`capabilities` is convenience data for UI rendering. Backend authorization remains authoritative.

### 8.5 Logout

```http
POST /api/v1/admin/auth/logout
```

Access: Authenticated.

Behavior:

- Invalidates the current session
- Rotates CSRF/session state as appropriate

Success `200`:

```json
{
  "data": null,
  "message": "Déconnexion réussie.",
  "meta": {
    "request_id": "..."
  }
}
```

### 8.6 Change own password

```http
POST /api/v1/admin/auth/change-password
```

Request:

```json
{
  "current_password": "old-password",
  "password": "new-password",
  "password_confirmation": "new-password"
}
```

Success invalidates other active sessions when configured by the security rules.

### 8.7 Confirm current password

```http
POST /api/v1/admin/auth/confirm-password
```

Request:

```json
{
  "password": "current-password"
}
```

Response:

```json
{
  "data": {
    "confirmed_until": "2026-07-18T14:50:22Z"
  },
  "meta": {
    "request_id": "..."
  }
}
```

The server stores recent confirmation in the authenticated session. It does not return a reusable bearer token.

---

## 9. Pagination, Filtering, and Sorting

### 9.1 Pagination

Admin collection endpoints accept:

```text
?page=1&per_page=25
```

Rules:

- Default `per_page`: 25
- Allowed: 10, 25, 50, 100
- Maximum: 100

### 9.2 Search

Collection search uses:

```text
?search=<term>
```

Search fields are endpoint-specific and allow-listed.

### 9.3 Sorting

Use:

```text
?sort=-created_at
```

- Prefix `-`: descending
- No prefix: ascending

Unknown sort fields produce `422 VALIDATION_FAILED`.

### 9.4 Filters

Use explicit query parameters:

```text
?status=nouvelle&category_id=01JCAT...&is_active=true
```

Do not accept arbitrary JSON filter expressions or raw SQL-like syntax.

---

## 10. Shared Resource Shapes

### 10.1 Money object

```json
{
  "millimes": 98500,
  "formatted": "98,500 TND"
}
```

### 10.2 Image object

```json
{
  "public_id": "01JIMG...",
  "url": "https://passioncosmetic.com/storage/products/example.webp",
  "alt_text": "Crème hydratante",
  "width": 1200,
  "height": 1200,
  "sort_order": 1,
  "is_primary": true,
  "variant_public_id": null
}
```

### 10.3 Category summary

```json
{
  "public_id": "01JCAT...",
  "name": "Soins du visage",
  "slug": "soins-du-visage",
  "is_active": true
}
```

### 10.4 Variant option

```json
{
  "group_public_id": "01JGRP...",
  "group_name": "Couleur",
  "value_public_id": "01JVAL...",
  "value": "Bleu"
}
```

### 10.5 Product-card resource

```json
{
  "public_id": "01JPROD...",
  "name": "Crème hydratante",
  "slug": "creme-hydratante",
  "category": {
    "public_id": "01JCAT...",
    "name": "Soins du visage",
    "slug": "soins-du-visage"
  },
  "regular_price": {
    "millimes": 100000,
    "formatted": "100,000 TND"
  },
  "promotional_price": {
    "millimes": 80000,
    "formatted": "80,000 TND"
  },
  "discount_percentage": 20,
  "primary_image": {
    "url": "https://...",
    "alt_text": "Crème hydratante"
  },
  "has_variants": false,
  "is_in_stock": true,
  "is_new": true
}
```

### 10.6 Order-status enum

Machine values:

- `nouvelle`
- `confirmee`
- `livree`
- `annulee`
- `echec_livraison`
- `retournee`

Suggested French labels:

| Value | Label |
|---|---|
| `nouvelle` | Nouvelle |
| `confirmee` | Confirmée |
| `livree` | Livrée |
| `annulee` | Annulée |
| `echec_livraison` | Échec de livraison |
| `retournee` | Retournée |

### 10.7 Complaint-status enum

- `nouvelle`
- `en_cours`
- `resolue`

### 10.8 Meta-event-status enum

- `pending`
- `processing`
- `succeeded`
- `retrying`
- `permanent_failed`
- `skipped`

### 10.9 Meta Purchase trigger enum

- `nouvelle`
- `confirmee`
- `livree`

---

# Part I — Public API

## 11. Search Suggestions

```http
GET /api/v1/public/search/suggestions
```

Rate limit: Public search limit.

Query:

```text
?q=creme&limit=8
```

Validation:

- `q`: required, string, trimmed, minimum 2 characters, maximum 100
- `limit`: optional, integer, 1–10, default 8

Response `200`:

```json
{
  "data": {
    "products": [
      {
        "public_id": "01JPROD...",
        "name": "Crème hydratante",
        "slug": "creme-hydratante",
        "primary_image_url": "https://...",
        "effective_price": {
          "millimes": 80000,
          "formatted": "80,000 TND"
        }
      }
    ],
    "categories": [
      {
        "public_id": "01JCAT...",
        "name": "Crèmes",
        "slug": "cremes"
      }
    ]
  },
  "meta": {
    "request_id": "..."
  }
}
```

Rules:

- Return active products only.
- Return active categories only.
- Do not expose stock quantities.
- Search is case-insensitive according to the configured collation.
- Cache short-lived results.
- Escape or normalize search terms; never interpolate raw SQL.

---

## 12. Public Checkout Fields

```http
GET /api/v1/public/checkout-fields
```

Returns active checkout fields in display order.

Response:

```json
{
  "data": [
    {
      "key": "full_name",
      "label": "Nom et prénom",
      "type": "text",
      "is_required": true,
      "options": null,
      "sort_order": 1
    },
    {
      "key": "phone",
      "label": "Téléphone",
      "type": "text",
      "is_required": true,
      "options": null,
      "sort_order": 2
    },
    {
      "key": "city",
      "label": "Ville",
      "type": "text",
      "is_required": true,
      "options": null,
      "sort_order": 3
    },
    {
      "key": "address",
      "label": "Adresse",
      "type": "textarea",
      "is_required": true,
      "options": null,
      "sort_order": 4
    }
  ],
  "meta": {
    "schema_version": "sha256-or-version-value",
    "promo_code_field_visible": false,
    "request_id": "..."
  }
}
```

The `schema_version` allows checkout submission to detect material form changes.

---

## 13. Authoritative Cart Quote

```http
POST /api/v1/public/cart/quote
```

Rate limit: Public quote limit.

Request:

```json
{
  "items": [
    {
      "product_public_id": "01JPROD...",
      "variant_public_id": null,
      "quantity": 2
    },
    {
      "product_public_id": "01JPROD2...",
      "variant_public_id": "01JVAR...",
      "quantity": 1
    }
  ],
  "promo_code": "BEAUTY20"
}
```

Validation:

- `items`: required array, 1–100 lines
- `product_public_id`: required ULID
- `variant_public_id`: nullable ULID
- `quantity`: integer, 1–99
- `promo_code`: nullable string, maximum 80

Response `200`:

```json
{
  "data": {
    "items": [
      {
        "product_public_id": "01JPROD...",
        "variant_public_id": null,
        "name": "Crème hydratante",
        "variant_label": null,
        "image_url": "https://...",
        "quantity_requested": 2,
        "quantity_available": 7,
        "is_available": true,
        "regular_unit_price": {
          "millimes": 100000,
          "formatted": "100,000 TND"
        },
        "effective_unit_price": {
          "millimes": 80000,
          "formatted": "80,000 TND"
        },
        "line_total": {
          "millimes": 160000,
          "formatted": "160,000 TND"
        },
        "messages": []
      }
    ],
    "pricing": {
      "regular_subtotal": {
        "millimes": 200000,
        "formatted": "200,000 TND"
      },
      "product_discount": {
        "millimes": 40000,
        "formatted": "40,000 TND"
      },
      "subtotal": {
        "millimes": 160000,
        "formatted": "160,000 TND"
      },
      "promo_code": {
        "code": "BEAUTY20",
        "discount_percentage": 20,
        "discount": {
          "millimes": 32000,
          "formatted": "32,000 TND"
        }
      },
      "shipping": {
        "is_free": true,
        "fee": {
          "millimes": 0,
          "formatted": "Gratuite"
        },
        "free_threshold": {
          "millimes": 120000,
          "formatted": "120,000 TND"
        }
      },
      "total": {
        "millimes": 128000,
        "formatted": "128,000 TND"
      }
    },
    "can_checkout": true
  },
  "meta": {
    "quoted_at": "2026-07-18T14:35:22Z",
    "request_id": "..."
  }
}
```

Rules:

- The response is not a stock reservation.
- Prices and stock can change before checkout submission.
- Invalid items return line messages and `can_checkout: false` where possible.
- A completely malformed cart returns `422`.
- Promo-code error may be returned as a validation/business error.
- The server ignores any price fields sent by the client.

---

## 14. Create Guest Order

```http
POST /api/v1/public/orders
```

Required header:

```http
Idempotency-Key: <uuid-v4>
```

Rate limit: Checkout limit.

Request:

```json
{
  "checkout_schema_version": "sha256-or-version-value",
  "customer": {
    "full_name": "Client Example",
    "phone": "22123456",
    "city": "Tunis",
    "address": "10 rue Example"
  },
  "custom_fields": {
    "building_notes": "2e étage"
  },
  "items": [
    {
      "product_public_id": "01JPROD...",
      "variant_public_id": null,
      "quantity": 2
    }
  ],
  "promo_code": null,
  "attribution": {
    "fbp": "fb.1.123...",
    "fbc": "fb.1.123...",
    "landing_url": "https://passioncosmetic.com/produits/...",
    "referrer_url": "https://www.facebook.com/",
    "utm_source": "facebook",
    "utm_medium": "paid_social",
    "utm_campaign": "summer",
    "utm_content": "creative_a",
    "utm_term": null,
    "consent_status": "granted"
  }
}
```

Client must not send:

- Status
- Prices
- Discounts
- Shipping fee
- Total
- Meta event ID
- Meta trigger
- Order reference

Validation:

- Idempotency key: required valid UUID
- Checkout schema version: required
- Full name: required, 2–180 characters
- Phone: required, normalized server-side, maximum 40
- City: required free text, 2–160 characters
- Address: required, 5–2000 characters
- Items: 1–100
- Quantity: 1–99
- Attribution values: optional and length-limited
- Consent state: required according to privacy implementation
- Unknown custom field keys: rejected
- Missing required active custom fields: rejected

Success `201`:

```json
{
  "data": {
    "order": {
      "public_reference": "01JORDER...",
      "status": "nouvelle",
      "customer": {
        "full_name": "Client Example",
        "phone": "22123456",
        "city": "Tunis",
        "address": "10 rue Example"
      },
      "items": [
        {
          "product_name": "Crème hydratante",
          "variant": null,
          "quantity": 2,
          "effective_unit_price": {
            "millimes": 80000,
            "formatted": "80,000 TND"
          },
          "line_total": {
            "millimes": 160000,
            "formatted": "160,000 TND"
          }
        }
      ],
      "pricing": {
        "subtotal": {
          "millimes": 160000,
          "formatted": "160,000 TND"
        },
        "product_discount": {
          "millimes": 40000,
          "formatted": "40,000 TND"
        },
        "promo_code_discount": {
          "millimes": 0,
          "formatted": "0,000 TND"
        },
        "shipping_fee": {
          "millimes": 0,
          "formatted": "Gratuite"
        },
        "total": {
          "millimes": 160000,
          "formatted": "160,000 TND"
        }
      },
      "payment_method": "cash_on_delivery",
      "created_at": "2026-07-18T14:35:22Z"
    },
    "confirmation": {
      "url": "https://passioncosmetic.com/commande/confirmee/<signed-token>",
      "expires_at": "2026-07-25T14:35:22Z"
    },
    "meta": {
      "browser_purchase_required": true,
      "event_name": "Purchase",
      "event_id": "purchase_01JORDER..._...",
      "pixel_id": "123456789",
      "value_millimes": 160000,
      "currency": "TND"
    }
  },
  "meta": {
    "request_id": "..."
  }
}
```

If the Purchase trigger is `confirmee` or `livree`:

```json
{
  "meta": {
    "browser_purchase_required": false
  }
}
```

Idempotent replay with identical canonical payload:

- Returns `200`
- Returns the existing order result
- Does not deduct stock twice
- Does not consume promo usage twice
- Does not create another Meta event

Same idempotency key with different canonical payload:

- Returns `409 CHECKOUT_IDEMPOTENCY_CONFLICT`

Possible conflicts:

- `409 INSUFFICIENT_STOCK`
- `409 STOCK_CONFLICT`
- `409 CHECKOUT_IDEMPOTENCY_CONFLICT`
- `409 CHECKOUT_FIELDS_CHANGED`

Security:

- Never return stored `_fbp`, `_fbc`, IP, or user agent.
- Never synchronously wait for Meta CAPI.
- Never expose the CAPI token.
- Confirmation URL must be signed and unguessable.

---

## 15. Submit Complaint

```http
POST /api/v1/public/complaints
```

Content type: `multipart/form-data`

Rate limit: Complaint submission limit.

Fields:

| Field | Required | Type |
|---|---:|---|
| `customer_name` | Yes | string, 2–180 |
| `customer_phone` | Yes | string, max 40 |
| `order_reference` | No | ULID |
| `subject` | Yes | string, 3–200 |
| `description` | Yes | string, 10–5000 |
| `attachment` | No | approved image file |
| `consent` | Yes | boolean true |

Success `201`:

```json
{
  "data": {
    "public_reference": "01JCOMP...",
    "status": "nouvelle",
    "submitted_at": "2026-07-18T14:35:22Z"
  },
  "message": "Votre réclamation a été envoyée.",
  "meta": {
    "request_id": "..."
  }
}
```

Rules:

- Do not reveal whether an order reference exists unless the submitted phone and policy permit association.
- Store attachment on a private disk.
- Validate file signature, MIME type, extension, and size.
- Strip unsafe metadata where defined by security rules.
- Public API never exposes attachment paths.

---

# Part II — Admin API

## 16. Dashboard

### 16.1 Dashboard summary

```http
GET /api/v1/admin/dashboard/summary
```

Access: Admin, Super Admin.

Query:

```text
?period=today
?period=last_7_days
?period=last_30_days
?period=current_month
?date_from=2026-07-01&date_to=2026-07-18
```

Response:

```json
{
  "data": {
    "period": {
      "date_from": "2026-07-01",
      "date_to": "2026-07-18",
      "timezone": "Africa/Tunis"
    },
    "orders": {
      "nouvelle": 12,
      "confirmee": 8,
      "livree": 31,
      "annulee": 4,
      "echec_livraison": 3,
      "retournee": 1
    },
    "delivered_revenue": {
      "millimes": 4215000,
      "formatted": "4 215,000 TND"
    },
    "average_delivered_order": {
      "millimes": 135968,
      "formatted": "135,968 TND"
    },
    "best_selling_products": [],
    "low_stock_items": [],
    "recent_complaints": [],
    "meta_summary": {
      "pending": 2,
      "succeeded": 93,
      "retrying": 1,
      "permanent_failed": 0
    }
  },
  "meta": {
    "request_id": "..."
  }
}
```

Admin receives only Meta summary counts. Detailed event diagnostics require Super Admin.

---

## 17. Categories

### 17.1 List categories

```http
GET /api/v1/admin/categories
```

Access: Admin, Super Admin.

Filters:

- `search`
- `is_active`
- `sort`: `name`, `-name`, `sort_order`, `-created_at`

### 17.2 Create category

```http
POST /api/v1/admin/categories
```

Request:

```json
{
  "name": "Soins du visage",
  "slug": "soins-du-visage",
  "is_active": true,
  "sort_order": 10,
  "seo_title": "Soins du visage",
  "seo_description": "Découvrez nos soins du visage."
}
```

Success `201`.

Validation:

- `name`: required, 2–160
- `slug`: optional; generated when omitted
- `is_active`: boolean
- `sort_order`: integer >= 0
- SEO title max 255
- SEO description max 320

### 17.3 Get category

```http
GET /api/v1/admin/categories/{category_public_id}
```

### 17.4 Update category

```http
PATCH /api/v1/admin/categories/{category_public_id}
```

Partial request.

Slug change must create or update a safe redirect from the old public path.

### 17.5 Reorder categories

```http
POST /api/v1/admin/categories/reorder
```

Request:

```json
{
  "items": [
    {
      "public_id": "01JCAT1...",
      "sort_order": 1
    },
    {
      "public_id": "01JCAT2...",
      "sort_order": 2
    }
  ]
}
```

Operation must be transactional.

### 17.6 Delete unused category

```http
DELETE /api/v1/admin/categories/{category_public_id}
```

Behavior:

- Soft-delete or archive according to implementation
- Reject with `409 CATEGORY_IN_USE` when products reference it

---

## 18. Products

### 18.1 List products

```http
GET /api/v1/admin/products
```

Access: Admin, Super Admin.

Filters:

- `search`
- `category_id`
- `is_active`
- `has_variants`
- `stock_state`: `in_stock`, `low_stock`, `out_of_stock`
- `is_promotional`
- `created_from`
- `created_to`

Sort allow-list:

- `name`
- `-name`
- `regular_price_millimes`
- `-regular_price_millimes`
- `created_at`
- `-created_at`
- `published_at`
- `-published_at`
- `stock_quantity`
- `-stock_quantity`

### 18.2 Product details

```http
GET /api/v1/admin/products/{product_public_id}
```

Response includes:

- Product fields
- Category
- Images
- Option groups
- Option values
- Accepted variants
- Variant stocks
- Low-stock thresholds
- SEO data
- `lock_version` if product concurrency is implemented

### 18.3 Create product

```http
POST /api/v1/admin/products
```

Request without variants:

```json
{
  "category_public_id": "01JCAT...",
  "name": "Crème hydratante",
  "slug": "creme-hydratante",
  "short_description": "Hydratation quotidienne.",
  "full_description": "<p>Description contrôlée.</p>",
  "regular_price_millimes": 100000,
  "promotional_price_millimes": 80000,
  "stock_quantity": 25,
  "low_stock_threshold": 5,
  "is_active": true,
  "published_at": "2026-07-18T14:35:22Z",
  "seo_title": null,
  "seo_description": null,
  "has_variants": false
}
```

Request with variants:

```json
{
  "category_public_id": "01JCAT...",
  "name": "Rouge à lèvres",
  "regular_price_millimes": 45000,
  "promotional_price_millimes": null,
  "stock_quantity": null,
  "low_stock_threshold": null,
  "is_active": true,
  "has_variants": true,
  "option_groups": [
    {
      "client_key": "group-color",
      "name": "Couleur",
      "sort_order": 1,
      "values": [
        {
          "client_key": "value-red",
          "value": "Rouge",
          "sort_order": 1
        },
        {
          "client_key": "value-blue",
          "value": "Bleu",
          "sort_order": 2
        }
      ]
    }
  ],
  "variants": [
    {
      "client_key": "variant-red",
      "option_value_client_keys": [
        "value-red"
      ],
      "sku": "RAL-RED",
      "stock_quantity": 10,
      "low_stock_threshold": 2,
      "is_active": true
    },
    {
      "client_key": "variant-blue",
      "option_value_client_keys": [
        "value-blue"
      ],
      "sku": "RAL-BLU",
      "stock_quantity": 7,
      "low_stock_threshold": 2,
      "is_active": true
    }
  ]
}
```

Creation is transactional.

Rules:

- Product-level prices apply to every variant.
- `stock_quantity` must be null when `has_variants` is true.
- Variants must use values from the product’s own option groups.
- Duplicate combinations are rejected.
- Empty accepted variant sets are invalid for an active variant-based product.

### 18.4 Update product

```http
PATCH /api/v1/admin/products/{product_public_id}
```

Simple fields may be patched directly.

Changing `has_variants` must not be performed by a normal patch. Use the protected variant-mode command below.

### 18.5 Switch product variant mode

```http
POST /api/v1/admin/products/{product_public_id}/variant-mode
```

Access: Admin, Super Admin.

Request to enable:

```json
{
  "has_variants": true,
  "confirmation": "CONFIRMER",
  "option_groups": [],
  "variants": []
}
```

Request to disable:

```json
{
  "has_variants": false,
  "confirmation": "CONFIRMER",
  "resulting_stock_quantity": 17
}
```

The backend must prevent stock loss and reject ambiguous migrations.

### 18.6 Update product variants

```http
PUT /api/v1/admin/products/{product_public_id}/variants
```

This endpoint fully replaces the option-group/value/variant configuration after validating a safe diff.

Request includes a `lock_version` or equivalent product version.

The service must:

- Reject duplicate combinations
- Preserve referenced variant records where possible
- Prevent deleting variants referenced by editable orders unless migrated safely
- Preserve historical order snapshots
- Reconcile image links
- Audit changes

### 18.7 Activate/deactivate product

```http
POST /api/v1/admin/products/{product_public_id}/status
```

Request:

```json
{
  "is_active": false
}
```

### 18.8 Delete/archive product

```http
DELETE /api/v1/admin/products/{product_public_id}
```

Behavior:

- If never referenced: safe soft deletion permitted
- If referenced by orders: archive/deactivate; do not remove historical references
- Return `409 PRODUCT_IN_USE` when the requested action would violate history

---

## 19. Product Media

### 19.1 Upload image

```http
POST /api/v1/admin/products/{product_public_id}/images
```

Content type: `multipart/form-data`

Fields:

- `image`: required
- `alt_text`: optional
- `variant_public_id`: optional
- `is_primary`: optional boolean
- `sort_order`: optional integer

Success `201`:

```json
{
  "data": {
    "public_id": "01JIMG...",
    "processing_status": "pending"
  },
  "meta": {
    "request_id": "..."
  }
}
```

Image processing may be asynchronous. A later product read returns optimized renditions.

### 19.2 Update image metadata

```http
PATCH /api/v1/admin/products/{product_public_id}/images/{image_public_id}
```

Request:

```json
{
  "alt_text": "Rouge à lèvres bleu",
  "variant_public_id": "01JVAR...",
  "is_primary": false,
  "sort_order": 2
}
```

### 19.3 Reorder images

```http
POST /api/v1/admin/products/{product_public_id}/images/reorder
```

### 19.4 Delete image

```http
DELETE /api/v1/admin/products/{product_public_id}/images/{image_public_id}
```

Rules:

- Prevent orphaning an active product without a usable image only if the product policy requires one.
- Deleting the primary image should promote the next valid image or require a new primary.
- Queue physical cleanup after database commit.
- Never accept arbitrary filesystem paths.

---

## 20. Orders

### 20.1 List orders

```http
GET /api/v1/admin/orders
```

Access: Admin, Super Admin.

Filters:

- `search`: reference, customer name, normalized phone
- `status`
- `date_from`
- `date_to`
- `min_total_millimes`
- `max_total_millimes`
- `promo_code`
- `has_complaint`
- `meta_purchase_state`: `missing`, `pending`, `succeeded`, `failed`

Sort:

- `created_at`
- `-created_at`
- `total_millimes`
- `-total_millimes`
- `status`
- `customer_name`

### 20.2 Get order

```http
GET /api/v1/admin/orders/{order_public_reference}
```

Response:

```json
{
  "data": {
    "public_reference": "01JORDER...",
    "status": "nouvelle",
    "lock_version": 1,
    "is_editable": true,
    "allowed_transitions": [
      "confirmee",
      "annulee"
    ],
    "customer": {
      "full_name": "Client Example",
      "phone": "22123456",
      "city": "Tunis",
      "address": "10 rue Example"
    },
    "items": [],
    "custom_checkout_values": [],
    "pricing": {},
    "promo_code": null,
    "status_history": [],
    "notes": [],
    "complaints": [],
    "meta_purchase": {
      "expected": true,
      "event_public_id": "01JMETA...",
      "status": "succeeded"
    },
    "created_at": "2026-07-18T14:35:22Z",
    "updated_at": "2026-07-18T14:35:22Z"
  },
  "meta": {
    "request_id": "..."
  }
}
```

Admin may receive only a summary for Meta fields.

### 20.3 Edit order

```http
PATCH /api/v1/admin/orders/{order_public_reference}
```

Access: Admin, Super Admin.

Request:

```json
{
  "lock_version": 1,
  "customer": {
    "full_name": "Client Corrected",
    "phone": "22123456",
    "city": "Ariana",
    "address": "Nouvelle adresse"
  },
  "items": [
    {
      "product_public_id": "01JPROD...",
      "variant_public_id": null,
      "quantity": 1
    }
  ],
  "custom_fields": {
    "building_notes": "Rez-de-chaussée"
  }
}
```

Success returns the updated order with incremented `lock_version`.

Rules:

- Allowed only in `nouvelle` or `confirmee`.
- Prices are recalculated from current approved business rules.
- Stock is reconciled transactionally.
- Meta Purchase already sent is not rewritten or resent.
- Stale version returns `409 ORDER_VERSION_CONFLICT`.
- Terminal statuses return `409 ORDER_NOT_EDITABLE`.

### 20.4 Transition order status

```http
POST /api/v1/admin/orders/{order_public_reference}/transitions
```

Request examples:

Confirm:

```json
{
  "to_status": "confirmee",
  "reason": null,
  "lock_version": 2
}
```

Cancel:

```json
{
  "to_status": "annulee",
  "reason": "Client injoignable",
  "lock_version": 2
}
```

Delivery failure:

```json
{
  "to_status": "echec_livraison",
  "reason": "Client a refusé le colis",
  "lock_version": 4
}
```

Return:

```json
{
  "to_status": "retournee",
  "reason": "Produit retourné",
  "restock_items": false,
  "lock_version": 5
}
```

Rules:

- `reason` may be required for exception statuses.
- `restock_items` is required for `retournee`.
- Stock restoration must be idempotent.
- Transition may create the logical Meta Purchase when the snapshotted trigger is reached.
- A duplicate transition request must not duplicate stock or Meta events.

### 20.5 Add internal note

```http
POST /api/v1/admin/orders/{order_public_reference}/notes
```

Request:

```json
{
  "body": "Le client préfère être appelé le matin."
}
```

Notes are append-only through normal APIs.

### 20.6 Print order

```http
GET /api/v1/admin/orders/{order_public_reference}/print
```

Returns printable HTML or PDF according to the later design decision.

Must require authentication and authorization.

### 20.7 Export orders

```http
POST /api/v1/admin/orders/exports
```

Request includes the same allow-listed filters as the list endpoint.

Response `202` for asynchronous export:

```json
{
  "data": {
    "export_id": "01JEXPORT...",
    "status": "queued"
  },
  "meta": {
    "request_id": "..."
  }
}
```

If initial scope chooses synchronous small CSV exports, the implementation must document a strict row limit.

---

## 21. Complaints

### 21.1 List complaints

```http
GET /api/v1/admin/complaints
```

Access: Admin, Super Admin.

Filters:

- `search`
- `status`
- `order_reference`
- `date_from`
- `date_to`
- `has_attachment`

### 21.2 Get complaint

```http
GET /api/v1/admin/complaints/{complaint_public_reference}
```

Includes:

- Customer data
- Linked-order summary
- Status
- Description
- Attachment metadata
- Notes
- Timeline

### 21.3 Update complaint

```http
PATCH /api/v1/admin/complaints/{complaint_public_reference}
```

Request:

```json
{
  "order_reference": "01JORDER..."
}
```

Only approved editable relationship fields may be changed.

### 21.4 Change complaint status

```http
POST /api/v1/admin/complaints/{complaint_public_reference}/transitions
```

Request:

```json
{
  "to_status": "en_cours"
}
```

Allowed:

```text
nouvelle -> en_cours
en_cours -> resolue
```

A direct `nouvelle -> resolue` transition may be allowed only if explicitly approved in business rules; default is rejected.

### 21.5 Add complaint note

```http
POST /api/v1/admin/complaints/{complaint_public_reference}/notes
```

### 21.6 Download complaint attachment

```http
GET /api/v1/admin/complaints/{complaint_public_reference}/attachment
```

Requirements:

- Authenticated authorized user
- Private storage retrieval
- Safe `Content-Disposition`
- No direct storage path exposure
- Audit access when required by privacy rules

---

## 22. Promo Codes

Access: Super Admin only.

### 22.1 List promo codes

```http
GET /api/v1/admin/promo-codes
```

Filters:

- `search`
- `is_active`
- `date_state`: `scheduled`, `active`, `expired`
- `usage_state`: `available`, `exhausted`

### 22.2 Create promo code

```http
POST /api/v1/admin/promo-codes
```

Request:

```json
{
  "code": "BEAUTY20",
  "discount_percentage": 20,
  "usage_limit": 200,
  "minimum_subtotal_millimes": 50000,
  "starts_at": "2026-08-01T00:00:00Z",
  "ends_at": "2026-08-31T23:59:59Z",
  "is_active": true
}
```

### 22.3 Update promo code

```http
PATCH /api/v1/admin/promo-codes/{promo_code_public_id}
```

Rules:

- `usage_count` cannot be directly overwritten by a normal request.
- Usage limit cannot be reduced below current usage count.
- Code normalization is uppercase.
- Code changes are audited.

### 22.4 Activate/deactivate

```http
POST /api/v1/admin/promo-codes/{promo_code_public_id}/status
```

### 22.5 Delete promo code

```http
DELETE /api/v1/admin/promo-codes/{promo_code_public_id}
```

If referenced by orders, archive/deactivate instead of destructive deletion.

---

## 23. Checkout Fields

Access: Super Admin only.

### 23.1 List fields

```http
GET /api/v1/admin/checkout-fields
```

### 23.2 Create field

```http
POST /api/v1/admin/checkout-fields
```

Request:

```json
{
  "key": "building_notes",
  "label": "Informations complémentaires",
  "type": "textarea",
  "options": null,
  "is_required": false,
  "is_active": true,
  "sort_order": 5
}
```

Rules:

- Keys are stable machine identifiers.
- Keys must match an approved pattern such as `[a-z][a-z0-9_]{1,99}`.
- Dropdown/radio requires non-empty unique options.
- Text/textarea/number/checkbox must not accept irrelevant options.

### 23.3 Update field

```http
PATCH /api/v1/admin/checkout-fields/{field_public_id}
```

System-field restrictions:

- Cannot delete default fields
- Default fields remain required in v1
- Type/key changes that would break historical or active checkout behavior may be prohibited
- Label and order may be changed if approved

### 23.4 Reorder fields

```http
POST /api/v1/admin/checkout-fields/reorder
```

### 23.5 Delete custom field

```http
DELETE /api/v1/admin/checkout-fields/{field_public_id}
```

Historical order snapshots remain intact.

---

## 24. Store and Shipping Settings

Access: Super Admin only.

### 24.1 Get public store settings

```http
GET /api/v1/admin/settings/store
```

Response:

```json
{
  "data": {
    "phone": "+216...",
    "email": "contact@example.com",
    "address": "Tunis",
    "whatsapp_url": "https://wa.me/216...",
    "social_links": {
      "facebook": "https://...",
      "instagram": "https://..."
    },
    "announcement_text": "Livraison gratuite à partir de 120 DT"
  },
  "meta": {
    "request_id": "..."
  }
}
```

### 24.2 Update store settings

```http
PATCH /api/v1/admin/settings/store
```

Only registered setting keys are accepted.

### 24.3 Get shipping settings

```http
GET /api/v1/admin/settings/shipping
```

Response:

```json
{
  "data": {
    "fixed_fee_millimes": 8000,
    "free_threshold_enabled": true,
    "free_threshold_millimes": 120000
  },
  "meta": {
    "request_id": "..."
  }
}
```

### 24.4 Update shipping settings

```http
PATCH /api/v1/admin/settings/shipping
```

Request:

```json
{
  "fixed_fee_millimes": 8000,
  "free_threshold_enabled": true,
  "free_threshold_millimes": 120000
}
```

Rules:

- Fixed fee >= 0
- Threshold required when enabled
- Cache invalidated after update
- Cart and checkout use the new values immediately
- Audit log records old and new values

### 24.5 Promo-field visibility

```http
PATCH /api/v1/admin/settings/checkout
```

Request:

```json
{
  "promo_code_field_visible": false
}
```

---

## 25. Homepage Sections

Access: Super Admin only.

### 25.1 List sections

```http
GET /api/v1/admin/content/homepage-sections
```

### 25.2 Create section

```http
POST /api/v1/admin/content/homepage-sections
```

Custom section request:

```json
{
  "type": "custom",
  "title": "Nos promotions",
  "is_active": true,
  "filters_enabled": true,
  "sort_order": 4,
  "product_public_ids": [
    "01JPROD1...",
    "01JPROD2..."
  ],
  "settings": {
    "max_products": 12
  }
}
```

Allowed types:

- `categories`
- `new_products`
- `all_products`
- `custom`

Rules:

- Custom title required for custom sections.
- Product IDs accepted only for custom sections.
- Inactive products may be configured but are not rendered publicly.
- Settings are type-validated; arbitrary nested keys are rejected.

### 25.3 Update section

```http
PATCH /api/v1/admin/content/homepage-sections/{section_public_id}
```

### 25.4 Reorder sections

```http
POST /api/v1/admin/content/homepage-sections/reorder
```

### 25.5 Delete custom section

```http
DELETE /api/v1/admin/content/homepage-sections/{section_public_id}
```

Default required sections may be deactivated or restricted rather than deleted, according to implementation policy.

---

## 26. Banners

Access: Super Admin only.

### 26.1 List banners

```http
GET /api/v1/admin/content/banners
```

### 26.2 Create banner

```http
POST /api/v1/admin/content/banners
```

`multipart/form-data`:

- `title`: optional internal label
- `desktop_image`: required image
- `mobile_image`: optional image
- `link_url`: optional validated URL
- `is_active`: boolean
- `sort_order`: integer

External links must be explicitly validated. Internal relative URLs are preferred.

### 26.3 Update metadata or images

```http
POST /api/v1/admin/content/banners/{banner_public_id}
```

Use `_method=PATCH` for multipart updates if necessary.

### 26.4 Reorder banners

```http
POST /api/v1/admin/content/banners/reorder
```

### 26.5 Delete banner

```http
DELETE /api/v1/admin/content/banners/{banner_public_id}
```

---

## 27. Static Pages

Access: Super Admin only.

### 27.1 List pages

```http
GET /api/v1/admin/content/pages
```

### 27.2 Get page

```http
GET /api/v1/admin/content/pages/{page_key}
```

Stable keys may include:

- `about`
- `contact`
- `terms`
- `privacy`
- `delivery`
- `returns_complaints`
- `faq`

### 27.3 Update page

```http
PATCH /api/v1/admin/content/pages/{page_key}
```

Request:

```json
{
  "title": "Politique de livraison",
  "slug": "politique-de-livraison",
  "content": "<p>Contenu contrôlé.</p>",
  "is_active": true,
  "seo_title": "Politique de livraison",
  "seo_description": "Informations sur la livraison."
}
```

Rules:

- HTML is sanitized by an allow-list.
- Script, iframe, event-handler, and unsafe URL content is rejected or stripped.
- Slug changes create redirects.
- Stable logical key cannot be changed.

---

## 28. Users

Access: Super Admin only.

### 28.1 List users

```http
GET /api/v1/admin/users
```

Filters:

- `search`
- `role`
- `is_active`

### 28.2 Create user

```http
POST /api/v1/admin/users
```

Request:

```json
{
  "name": "Admin",
  "email": "admin@example.com",
  "role": "admin",
  "is_active": true,
  "password": "temporary-password",
  "password_confirmation": "temporary-password",
  "force_password_change": true
}
```

The password is write-only and never returned.

### 28.3 Get user

```http
GET /api/v1/admin/users/{user_public_id}
```

### 28.4 Update user

```http
PATCH /api/v1/admin/users/{user_public_id}
```

Request may include:

```json
{
  "name": "Updated Name",
  "email": "updated@example.com",
  "role": "admin",
  "is_active": true
}
```

Rules:

- Protect final active Super Admin.
- Protect dangerous self-demotion/deactivation.
- Require recent password confirmation for critical role/status changes.

### 28.5 Reset user password

```http
POST /api/v1/admin/users/{user_public_id}/reset-password
```

Requires recent password confirmation.

Request:

```json
{
  "password": "new-temporary-password",
  "password_confirmation": "new-temporary-password",
  "force_password_change": true
}
```

Response never returns the password.

Audit data records only that a reset occurred.

### 28.6 Delete/archive user

```http
DELETE /api/v1/admin/users/{user_public_id}
```

Prefer disabling/soft removal.

Reject when final Super Admin protection applies.

---

## 29. Audit Logs

Access: Super Admin only.

### 29.1 List audit logs

```http
GET /api/v1/admin/audit-logs
```

Filters:

- `actor_user_id`
- `actor_role`
- `action`
- `auditable_type`
- `auditable_id`
- `date_from`
- `date_to`

Sort:

- `created_at`
- `-created_at`

Response values are redacted.

### 29.2 Get audit log

```http
GET /api/v1/admin/audit-logs/{audit_log_id}
```

If an external public identifier is used, prefer it over a numeric ID. Audit logs are immutable.

No update or delete endpoints exist.

---

## 30. Meta Configuration

Access: Super Admin only.

### 30.1 Get configuration

```http
GET /api/v1/admin/meta/configuration
```

Response:

```json
{
  "data": {
    "pixel_id": "123456789",
    "capi_token_configured": true,
    "capi_token_last_four": "A7F2",
    "purchase_trigger": "nouvelle",
    "tracking_enabled": true,
    "test_mode": false,
    "test_event_code_configured": false,
    "configuration_version": 4,
    "last_tested_at": "2026-07-18T13:00:00Z",
    "last_test_result": "succeeded"
  },
  "meta": {
    "request_id": "..."
  }
}
```

Never return:

- Encrypted token
- Plain token
- Full test-event code if treated as secret

### 30.2 Test proposed configuration

```http
POST /api/v1/admin/meta/configuration/test
```

Request:

```json
{
  "pixel_id": "987654321",
  "capi_token": "new-secret-token",
  "test_event_code": "TEST123"
}
```

Behavior:

- Uses request-memory values
- Does not replace active configuration
- Sends a safe test event
- Redacts secrets from logs and Sentry

Success:

```json
{
  "data": {
    "test_id": "c13ab0b1-e75f-4eaf-b086-9d702e57cfb1",
    "result": "succeeded",
    "tested_at": "2026-07-18T14:35:22Z",
    "pixel_id": "987654321",
    "meta_request_id": "redacted-safe-id"
  },
  "meta": {
    "request_id": "..."
  }
}
```

Failure returns `422 META_CONNECTION_TEST_FAILED` with a safe diagnostic message.

### 30.3 Activate configuration

```http
POST /api/v1/admin/meta/configuration/activate
```

Requires recent password confirmation.

Request:

```json
{
  "expected_configuration_version": 4,
  "tested_configuration": {
    "test_id": "c13ab0b1-e75f-4eaf-b086-9d702e57cfb1",
    "pixel_id": "987654321",
    "capi_token": "new-secret-token",
    "test_event_code": "TEST123"
  },
  "tracking_enabled": true,
  "test_mode": false,
  "confirmation_phrase": "CONFIRMER"
}
```

Requirements:

- Test record must be recent and belong to current session/user.
- Proposed values must match the tested fingerprint.
- Expected version prevents concurrent overwrites.
- Token encrypted before storage.
- Version increments atomically.
- Cache invalidated.
- Audit contains changed field names only.
- Plain secrets leave memory as soon as practical.

Success returns masked configuration.

### 30.4 Change Purchase trigger

```http
POST /api/v1/admin/meta/configuration/purchase-trigger
```

Requires:

- Recent password confirmation
- Typed phrase `CONFIRMER`
- Expected configuration version
- Prominent frontend warning

Request:

```json
{
  "expected_configuration_version": 5,
  "purchase_trigger": "confirmee",
  "confirmation_phrase": "CONFIRMER"
}
```

Response:

```json
{
  "data": {
    "old_trigger": "nouvelle",
    "new_trigger": "confirmee",
    "configuration_version": 6,
    "effective_for": "orders_created_after_change"
  },
  "meta": {
    "request_id": "..."
  }
}
```

Rules:

- Existing orders preserve their trigger snapshot.
- Existing Meta events are not resent.
- The change is audited.

### 30.5 Enable or disable tracking

```http
POST /api/v1/admin/meta/configuration/tracking-status
```

Requires recent password confirmation when disabling.

Request:

```json
{
  "tracking_enabled": false,
  "confirmation_phrase": "CONFIRMER"
}
```

---

## 31. Meta Diagnostics

Access:

- Admin: summary through dashboard only
- Super Admin: detailed endpoints

### 31.1 List events

```http
GET /api/v1/admin/meta/events
```

Filters:

- `status`
- `event_name`
- `order_reference`
- `date_from`
- `date_to`
- `configuration_version`

Response event:

```json
{
  "public_id": "01JMETA...",
  "order_reference": "01JORDER...",
  "event_name": "Purchase",
  "event_id": "purchase_01JORDER..._...",
  "trigger_status": "nouvelle",
  "status": "retrying",
  "configuration_version": 6,
  "attempt_count": 3,
  "next_attempt_at": "2026-07-18T15:00:00Z",
  "accepted_at": null,
  "last_error_code": "META_RATE_LIMIT",
  "last_error_message": "Échec temporaire, nouvel essai programmé.",
  "created_at": "2026-07-18T14:35:22Z"
}
```

No personal attribution data or raw payload is returned.

### 31.2 Get event

```http
GET /api/v1/admin/meta/events/{meta_event_public_id}
```

Includes sanitized attempt history.

### 31.3 Retry event

```http
POST /api/v1/admin/meta/events/{meta_event_public_id}/retry
```

Allowed only for retryable or explicitly recoverable failed events.

Response `202`.

Reject:

- Already succeeded
- Permanent deterministic payload error without corrected configuration
- Event not owned by current application context

### 31.4 Meta diagnostics summary

```http
GET /api/v1/admin/meta/diagnostics
```

Query supports dashboard date period.

Response includes:

- Counts by event status
- Acceptance rate
- Average attempts
- Last accepted event time
- Orders missing expected Purchase
- Current active configuration version
- Last connection-test result

---

## 32. URL Redirects

Access: Super Admin only.

Most redirects are created automatically after slug changes.

### 32.1 List redirects

```http
GET /api/v1/admin/content/redirects
```

### 32.2 Create redirect

```http
POST /api/v1/admin/content/redirects
```

Request:

```json
{
  "source_path": "/ancien-produit",
  "destination_path": "/produits/nouveau-produit",
  "status_code": 301,
  "is_active": true
}
```

Security:

- Reject redirect loops.
- Reject unsafe external open redirects.
- Prefer same-site relative destinations.
- Validate status code allow-list: 301 or 308.

### 32.3 Update redirect

```http
PATCH /api/v1/admin/content/redirects/{redirect_public_id}
```

### 32.4 Delete redirect

```http
DELETE /api/v1/admin/content/redirects/{redirect_public_id}
```

---

## 33. Public HTML Routes Related to API Behavior

These are server-rendered routes, not JSON APIs, but their behavior is contractually relevant.

```text
GET /
GET /produits
GET /produits/{slug}
GET /categories/{slug}
GET /recherche
GET /panier
GET /commande
GET /commande/confirmee/{signed_token}
GET /reclamation
GET /pages/{slug}
GET /sitemap.xml
GET /robots.txt
```

Requirements:

- Only active catalogue/content is public.
- Product/category slug changes use 301/308 redirects.
- Confirmation token is signed and expires.
- Confirmation page must not be indexable.
- Cart and checkout pages should not be indexed.
- Browser Purchase may fire only under the Meta rules in the system design.
- Refreshing confirmation page must not intentionally duplicate the event.

---

## 34. Cache and Conditional Request Behavior

### 34.1 Public reads

Safe public reads may include:

```http
Cache-Control: public, max-age=<short>, stale-while-revalidate=<value>
ETag: "<hash>"
```

### 34.2 Admin responses

Admin responses:

```http
Cache-Control: no-store
```

Sensitive responses must never be stored in shared caches.

### 34.3 Mutation responses

State-changing responses should use:

```http
Cache-Control: no-store
```

### 34.4 Cache invalidation

Catalogue, content, shipping, promo-field visibility, and Meta public Pixel settings invalidate related Redis/page caches after commit.

---

## 35. Concurrency and Idempotency

### 35.1 Checkout idempotency

- Header: `Idempotency-Key`
- Required UUID v4
- Persisted with canonical payload fingerprint
- Same key + same payload: replay existing result
- Same key + different payload: `409`

### 35.2 Admin optimistic locking

Orders require `lock_version` for edits and transitions.

Recommended for product variant replacement and Meta configuration activation.

Stale versions return `409`.

### 35.3 Duplicate command protection

Commands that change status or restore stock must be idempotent at the service/database layer.

Frontend button disabling is not sufficient.

### 35.4 Network calls

No network call to Meta, Sentry, external storage, or another service may occur while holding database stock locks.

---

## 36. Upload Contract

### 36.1 Product and banner images

Accepted types and limits will be finalized in security rules, with an initial baseline:

- JPEG
- PNG
- WebP
- Maximum source size defined by configuration
- Image signature validation
- Randomized server filename
- Asynchronous optimization
- No SVG unless a separate sanitization policy is approved

### 36.2 Complaint attachment

Initial baseline:

- Images only
- Private storage
- Strict size limit
- MIME and signature validation
- No executable content
- No direct public URL

### 36.3 Upload errors

- `413 PAYLOAD_TOO_LARGE`
- `415 UNSUPPORTED_MEDIA_TYPE`
- `422 COMPLAINT_ATTACHMENT_INVALID`

---

## 37. Rate-Limit Contract

Exact numbers belong in `security-rules.md`, but API behavior is fixed.

Rate-limit scopes include:

- Admin login
- Password confirmation
- Public search
- Cart quote
- Checkout submission
- Complaint submission
- Meta connection testing
- Manual Meta event retries
- Exports

Rate-limited response:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Trop de tentatives. Veuillez réessayer plus tard.",
    "details": {
      "retry_after_seconds": 60
    }
  },
  "meta": {
    "request_id": "..."
  }
}
```

---

## 38. Security and Privacy Contract Requirements

Every endpoint must follow these rules:

1. Validate through Laravel Form Requests or equivalent typed validators.
2. Authorize on the backend.
3. Reject unknown sensitive fields where practical.
4. Never mass-assign unvalidated request payloads.
5. Never return passwords, password hashes, session IDs, CSRF tokens, CAPI tokens, encryption keys, database credentials, Redis credentials, or raw attribution records.
6. Redact secrets from exceptions, logs, audit records, and Sentry.
7. Encrypt approved sensitive database fields.
8. Use parameterized queries/Eloquent.
9. Sanitize approved rich HTML through an allow-list.
10. Prevent insecure direct object references through public identifiers and policies.
11. Apply CSRF protection to authenticated cookie requests.
12. Use secure download controllers for private files.
13. Avoid returning different public complaint messages that reveal whether an order exists.
14. Set `Cache-Control: no-store` for authenticated and sensitive responses.
15. Audit critical changes after successful commit.

---

## 39. API Authorization Summary

| API group | Public | Admin | Super Admin |
|---|---:|---:|---:|
| Public search | Yes | Yes | Yes |
| Cart quote | Yes | Yes | Yes |
| Guest order creation | Yes | Yes | Yes |
| Public complaint submission | Yes | Yes | Yes |
| Dashboard operational summary | No | Yes | Yes |
| Products/categories | No | Manage | Manage |
| Orders | No | Manage | Manage |
| Complaints | No | Manage | Manage |
| Product media | No | Manage | Manage |
| Promo codes | No | No | Manage |
| Checkout fields | No | No | Manage |
| Store/shipping settings | No | No | Manage |
| Homepage/content/static pages | No | No | Manage |
| Users | No | No | Manage |
| Audit logs | No | No | View |
| Meta configuration | No | No | Manage |
| Detailed Meta diagnostics | No | Summary only | View/manage |
| Redirects | No | No | Manage |

---

## 40. Contract Testing Requirements

Codex must implement automated contract tests for every critical endpoint.

### 40.1 Public tests

- Search returns active products/categories only.
- Quote ignores client-supplied price-like fields.
- Quote recalculates all totals.
- Checkout requires idempotency key.
- Identical checkout retry returns the same order.
- Different payload with same key returns `409`.
- Checkout prevents overselling.
- Checkout consumes promo usage once.
- Checkout creates at most one Purchase event.
- Complaint validates consent and attachment.

### 40.2 Authentication tests

- Login success.
- Invalid credentials use generic response.
- Disabled account denied.
- Session regenerated.
- CSRF enforced.
- Logout invalidates session.
- Rate limit applied.
- Forced password change behavior.

### 40.3 Authorization tests

For each protected endpoint:

- Super Admin allowed when applicable.
- Admin allowed when applicable.
- Admin denied for Super-Admin-only functions.
- Unauthenticated request receives `401`.
- Direct API manipulation cannot bypass policy.

### 40.4 Order tests

- Only approved transitions work.
- Terminal orders cannot be edited.
- Stale `lock_version` returns `409`.
- Cancelled/failed orders restore stock once.
- Returned order requires restock decision.
- Admin edit reconciles stock transactionally.
- Existing Meta Purchase is not rewritten after edit.

### 40.5 Meta tests

- Configuration response is masked.
- Plain token never returned.
- Failed test does not replace active configuration.
- Activation requires successful matching test.
- Trigger change requires recent password and phrase.
- Trigger snapshot is preserved per order.
- Manual retry rejects succeeded events.
- Attempt responses contain no personal payload.

### 40.6 Upload tests

- Invalid MIME rejected.
- Oversized file rejected.
- Double extension does not bypass validation.
- Private complaint attachment cannot be accessed publicly.
- Unauthorized file access denied.

---

## 41. OpenAPI Generation Requirements

After implementation stabilizes:

- Generate an OpenAPI 3.1 document from these contracts.
- Keep examples aligned with this file.
- Do not allow generated annotations to silently redefine behavior.
- CI should fail when generated API documentation is stale if automated generation is adopted.
- Secrets must never appear in examples or generated schemas.

Recommended output:

```text
docs/openapi/api-v1.yaml
```

---

## 42. Deployment Neutrality

These API contracts must behave identically under both planned deployment models:

1. Docker-based single-VPS deployment
2. Non-Docker single-VPS deployment

Both future deployment plans will include simple GitHub Actions CI.

API URLs, payloads, validation, authorization, idempotency, queue semantics, and response envelopes must not depend on whether the runtime is containerized.

Deployment-specific health, service-management, and release procedures belong in the later deployment documents.

---

## 43. Codex Implementation Guardrails

Codex must not:

- Invent additional customer-authentication endpoints
- Add online payment fields
- Trust frontend totals
- Expose internal IDs
- Expose Meta secrets
- Send CAPI synchronously during checkout
- Hard-code the Meta Purchase trigger in a controller
- Duplicate status-transition logic across controllers
- Permit arbitrary setting keys
- Permit arbitrary sort/filter database columns
- Hard-delete orders or audit logs
- Bypass optimistic locking
- Use raw unvalidated HTML
- Return private attachment paths
- Add real-time infrastructure
- Make API behavior deployment-specific

Codex must:

- Use Form Requests
- Use API Resources
- Use policies/gates
- Use service/action classes for domain operations
- Use transactions for checkout, stock, promo use, order edit, and transitions
- Dispatch external jobs after commit
- Use stable error codes
- Write feature and authorization tests
- Keep public messages in French
- Keep code and documentation identifiers in English
- Follow this contract unless an explicit architecture decision changes it

---

## 44. Final Endpoint Inventory

### Public

```text
GET  /api/v1/public/search/suggestions
GET  /api/v1/public/checkout-fields
POST /api/v1/public/cart/quote
POST /api/v1/public/orders
POST /api/v1/public/complaints
```

### Authentication

```text
GET  /sanctum/csrf-cookie
POST /api/v1/admin/auth/login
POST /api/v1/admin/auth/logout
POST /api/v1/admin/auth/change-password
POST /api/v1/admin/auth/confirm-password
GET  /api/v1/admin/me
```

### Dashboard

```text
GET /api/v1/admin/dashboard/summary
```

### Categories

```text
GET    /api/v1/admin/categories
POST   /api/v1/admin/categories
GET    /api/v1/admin/categories/{category}
PATCH  /api/v1/admin/categories/{category}
DELETE /api/v1/admin/categories/{category}
POST   /api/v1/admin/categories/reorder
```

### Products and images

```text
GET    /api/v1/admin/products
POST   /api/v1/admin/products
GET    /api/v1/admin/products/{product}
PATCH  /api/v1/admin/products/{product}
DELETE /api/v1/admin/products/{product}
POST   /api/v1/admin/products/{product}/status
POST   /api/v1/admin/products/{product}/variant-mode
PUT    /api/v1/admin/products/{product}/variants

POST   /api/v1/admin/products/{product}/images
PATCH  /api/v1/admin/products/{product}/images/{image}
DELETE /api/v1/admin/products/{product}/images/{image}
POST   /api/v1/admin/products/{product}/images/reorder
```

### Orders

```text
GET   /api/v1/admin/orders
GET   /api/v1/admin/orders/{order}
PATCH /api/v1/admin/orders/{order}
POST  /api/v1/admin/orders/{order}/transitions
POST  /api/v1/admin/orders/{order}/notes
GET   /api/v1/admin/orders/{order}/print
POST  /api/v1/admin/orders/exports
```

### Complaints

```text
GET   /api/v1/admin/complaints
GET   /api/v1/admin/complaints/{complaint}
PATCH /api/v1/admin/complaints/{complaint}
POST  /api/v1/admin/complaints/{complaint}/transitions
POST  /api/v1/admin/complaints/{complaint}/notes
GET   /api/v1/admin/complaints/{complaint}/attachment
```

### Promo codes

```text
GET    /api/v1/admin/promo-codes
POST   /api/v1/admin/promo-codes
PATCH  /api/v1/admin/promo-codes/{promo_code}
DELETE /api/v1/admin/promo-codes/{promo_code}
POST   /api/v1/admin/promo-codes/{promo_code}/status
```

### Checkout fields

```text
GET    /api/v1/admin/checkout-fields
POST   /api/v1/admin/checkout-fields
PATCH  /api/v1/admin/checkout-fields/{field}
DELETE /api/v1/admin/checkout-fields/{field}
POST   /api/v1/admin/checkout-fields/reorder
```

### Settings

```text
GET   /api/v1/admin/settings/store
PATCH /api/v1/admin/settings/store
GET   /api/v1/admin/settings/shipping
PATCH /api/v1/admin/settings/shipping
PATCH /api/v1/admin/settings/checkout
```

### Homepage, banners, pages, redirects

```text
GET    /api/v1/admin/content/homepage-sections
POST   /api/v1/admin/content/homepage-sections
PATCH  /api/v1/admin/content/homepage-sections/{section}
DELETE /api/v1/admin/content/homepage-sections/{section}
POST   /api/v1/admin/content/homepage-sections/reorder

GET    /api/v1/admin/content/banners
POST   /api/v1/admin/content/banners
POST   /api/v1/admin/content/banners/{banner}
DELETE /api/v1/admin/content/banners/{banner}
POST   /api/v1/admin/content/banners/reorder

GET   /api/v1/admin/content/pages
GET   /api/v1/admin/content/pages/{page_key}
PATCH /api/v1/admin/content/pages/{page_key}

GET    /api/v1/admin/content/redirects
POST   /api/v1/admin/content/redirects
PATCH  /api/v1/admin/content/redirects/{redirect}
DELETE /api/v1/admin/content/redirects/{redirect}
```

### Users

```text
GET    /api/v1/admin/users
POST   /api/v1/admin/users
GET    /api/v1/admin/users/{user}
PATCH  /api/v1/admin/users/{user}
DELETE /api/v1/admin/users/{user}
POST   /api/v1/admin/users/{user}/reset-password
```

### Audit logs

```text
GET /api/v1/admin/audit-logs
GET /api/v1/admin/audit-logs/{audit_log}
```

### Meta

```text
GET  /api/v1/admin/meta/configuration
POST /api/v1/admin/meta/configuration/test
POST /api/v1/admin/meta/configuration/activate
POST /api/v1/admin/meta/configuration/purchase-trigger
POST /api/v1/admin/meta/configuration/tracking-status

GET  /api/v1/admin/meta/diagnostics
GET  /api/v1/admin/meta/events
GET  /api/v1/admin/meta/events/{meta_event}
POST /api/v1/admin/meta/events/{meta_event}/retry