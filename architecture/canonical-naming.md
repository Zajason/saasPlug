# saasPlug Canonical Naming and Consistency Sheet

This document is the source of truth for names used across the saasPlug codebase,
UML diagrams, API documentation, DTOs, and project management artifacts.

## 1. Actors

- EVUser
- ProviderAdmin
- PlatformOperator
- GoogleOAuthProvider
- ExternalProviderAPI
- PaymentGateway
- MessageBroker

## 2. Microservices

- ApiGateway
- AuthService
- UserService
- VehicleService
- ChargerService
- ReservationService
- SessionService
- BillingService
- ProviderService
- AnalyticsService
- IntegrationService
- AuditService
- MessageBroker

## 3. Service Responsibilities

| Service | Responsibility | Core Objects |
| --- | --- | --- |
| ApiGateway | Frontend request entry point, routing to internal services, authentication checks where needed | Route, GatewayRequest |
| AuthService | Login, EV user signup, provider signup, role resolution | User, AuthSession, Role |
| UserService | EV user profile, preferences, history, payment method references | UserProfile, PaymentMethod |
| VehicleService | Vehicle catalog and EV user vehicle ownership | Car, CarOwnership, CarColor |
| ChargerService | Provider charger data, charger search, availability, charger details | Charger, ProviderCharger, ChargerStatus, ConnectorType |
| ReservationService | Create and cancel charger reservations | Reservation, ReservationStatus |
| SessionService | Start and stop charging sessions | Session, SessionStatus |
| ProviderService | Provider registration, provider profile, external API configuration, owned chargers, subscriptions | Provider, ProviderAccount, ProviderApiConfig, ProviderSubscription, ProviderPlan, ProviderCharger |
| BillingService | EV user charging payments and invoices, provider SaaS billing and payment | Invoice, PaymentMethod, PaymentAuth, ProviderInvoice, ProviderPayment, BillingPeriod |
| AnalyticsService | Provider analytics, global operator analytics, usage summaries, usage export | ProviderAnalyticsReport, GlobalAnalyticsReport, UsageMetric, ExportJob |
| IntegrationService | External provider API communication and outbound webhooks | WebhookSubscription, WebhookEvent, ProviderApiConfig |
| AuditService | Cross-service audit logging | AuditEvent |
| MessageBroker | RabbitMQ topic exchange for service-to-service domain events | DomainEvent, EventQueue |

## 4. Service Ownership

| Entity / Responsibility | Service |
| --- | --- |
| Authentication | AuthService |
| User profile | UserService |
| Cars / ownership | VehicleService |
| Chargers | ChargerService |
| Availability | ChargerService |
| Reservations | ReservationService |
| Sessions | SessionService |
| User payments | BillingService |
| User invoices | BillingService |
| Provider accounts | ProviderService |
| Provider API config | ProviderService |
| Provider billing | BillingService |
| Analytics | AnalyticsService |
| Export data | AnalyticsService |
| Webhooks | IntegrationService |
| Audit logs | AuditService |
| Domain event transport | MessageBroker |

## 4.1 Messaging

- Broker: RabbitMQ
- Exchange: `saasplug.events`
- Exchange type: topic
- Integration queue: `integration.webhook-events`
- Event envelope: `DomainEvent`
- Routing keys:
  - `provider.registered`
  - `reservation.created`
  - `reservation.cancelled`
  - `session.started`
  - `session.stopped`
  - `billing.provider_invoice.created`
  - `integration.chargers.synced`

## 5. Persistency Entities

### Identity

- User
- Role

### Vehicles

- Car
- CarOwnership
- CarColor

### Charging

- Charger
- PricingProfile
- WholesalePricePoint
- ChargerStatus
- ConnectorType

### Reservation / Sessions

- Reservation
- ReservationStatus
- Session
- SessionStatus

### Billing (User-side)

- PaymentMethod
- PaymentAuth
- PaymentStatus
- Invoice

### Provider / SaaS

- Provider
- ProviderAccount
- ProviderApiConfig
- ProviderSubscription
- ProviderPlan
- ProviderInvoice
- ProviderPayment
- ProviderUsageRecord

### Analytics

- ProviderAnalyticsReport
- GlobalAnalyticsReport
- UsageMetric
- ExportJob
- ExportStatus
- ExportFormat

### Integration / Audit

- WebhookSubscription
- WebhookEvent
- AuditEvent

## 6. Invoice Naming

- Invoice: EV user charging invoice.
- ProviderInvoice: SaaS billing invoice issued to a provider.

## 7. Enums

- Role
- CarColor
- ChargerStatus
- ConnectorType
- ReservationStatus
- SessionStatus
- PaymentStatus
- ProviderStatus
- SubscriptionStatus
- ProviderInvoiceStatus
- ProviderPaymentStatus
- ExportStatus
- ExportFormat

## 8. DTO Naming

Use these naming patterns:

- `<Entity>Dto`
- `<Entity>SummaryDto`
- `<Entity>DetailsDto`

Examples:

- UserDto
- CarDto
- CarOwnershipDto
- ChargerDto
- ChargerSummaryDto
- ChargerDetailsDto
- ReservationDto
- ReservationSummaryDto
- ReservationDetailsDto
- SessionDto
- InvoiceDto
- ProviderDto
- ProviderInvoiceDto
- ProviderAnalyticsReportDto
- GlobalAnalyticsReportDto
- ExportJobDto
- WebhookEventDto
- AuditEventDto

## 9. API Request / Response Naming

### Auth

- GoogleLoginRequest
- AuthTokenResponse

### Charger

- SearchChargersRequest
- SearchChargersResponse
- GetChargerDetailsResponse

### Reservation

- CreateReservationRequest
- CreateReservationResponse
- CancelReservationRequest
- ReservationResponse

### Session

- StartSessionRequest
- StartSessionResponse
- StopSessionRequest
- StopSessionResponse

### Billing (User)

- AddPaymentMethodRequest
- PaymentMethodResponse
- PaymentAuthorizationResponse
- InvoiceResponse

### Provider

- RegisterProviderRequest
- RegisterProviderResponse
- ProviderProfileResponse

### Provider Billing

- GetProviderInvoiceResponse
- PayProviderInvoiceRequest
- PayProviderInvoiceResponse

### Analytics

- GetProviderAnalyticsRequest
- ProviderAnalyticsResponse
- GetGlobalAnalyticsRequest
- GlobalAnalyticsResponse
- ExportUsageDataRequest
- ExportUsageDataResponse

## 10. API Classes

- AuthController
- UserController
- VehicleController
- ChargerController
- ReservationController
- SessionController
- BillingController
- ProviderController
- AnalyticsController
- WebhookController

## 11. Relationships

- User owns CarOwnership.
- CarOwnership references Car.
- User creates Reservation.
- Reservation targets Charger.
- Reservation may create Session.
- User starts Session.
- Session occurs at Charger.
- Session has PaymentAuth.
- Session generates Invoice.
- User owns PaymentMethod.
- Provider manages Charger.
- Provider has ProviderApiConfig.
- Provider receives ProviderInvoice.
- ProviderInvoice is settled by ProviderPayment.
- AnalyticsService generates ProviderAnalyticsReport.
- PlatformOperator views GlobalAnalyticsReport.
- Provider requests ExportJob.
- WebhookSubscription receives WebhookEvent.
- AuditEvent references User or Session.

## 12. Use Cases

### EVUser

- LoginWithGoogle
- SearchChargers
- ViewChargerDetails
- CreateReservation
- CancelReservation
- StartSession
- StopSession

### ProviderAdmin

- RegisterProvider
- ConfigureProviderAPI
- ViewProviderAnalytics
- ViewProviderInvoice
- PayProviderInvoice
- ExportUsageData

### PlatformOperator

- ViewGlobalAnalytics

## 13. Naming Conventions

- Use exact names from this document.
- Do not use synonyms for canonical concepts such as Reservation, Charger, Invoice, ProviderInvoice, and Session.
- Use PascalCase for classes, DTOs, enums, actors, use cases, and services.
- Use camelCase for fields.
- Use the same names across all diagrams, code, API docs, and project documentation.
