# saasPlug — UML Model

NTUA · Software Services Technologies (SaaS) · Spring 2025-2026 · Group 02

This single markdown file embeds the full UML model for the saasPlug platform.
All diagrams use the canonical naming defined in
[`consistency_v1.pdf`](./consistency_v1.pdf).

## Table of Contents

1. [Use Case Diagram](#1-use-case-diagram)
2. [Activity Diagrams](#2-activity-diagrams)
   - 2.1 [Login / Search Chargers / View Charger](#21-login--search-chargers--view-charger)
   - 2.2 [Create / Cancel Reservation](#22-create--cancel-reservation)
   - 2.3 [Start / Stop Session — Payment](#23-start--stop-session--payment)
   - 2.4 [Register Provider / Configure API / Analytics / Export](#24-register-provider--configure-api--analytics--export)
   - 2.5 [View / Pay Provider Invoice](#25-view--pay-provider-invoice)
   - 2.6 [View Global Analytics](#26-view-global-analytics)
3. [ER Diagram — Persistency](#3-er-diagram--persistency)
4. [Class Diagram — Data Structures (DTOs & Enums)](#4-class-diagram--data-structures-dtos--enums)
5. [Class Diagram — APIs (Controllers & Request/Response)](#5-class-diagram--apis-controllers--requestresponse)
6. [Component Diagram](#6-component-diagram)
7. [Deployment Diagram](#7-deployment-diagram)
8. [Sequence Diagrams](#8-sequence-diagrams)
   - 8.1 [LoginWithGoogle](#81-loginwithgoogle)
   - 8.2 [SearchChargers + ViewChargerDetails](#82-searchchargers--viewchargerdetails)
   - 8.3 [CreateReservation](#83-createreservation)
   - 8.4 [CancelReservation](#84-cancelreservation)
   - 8.5 [StartSession / StopSession](#85-startsession--stopsession)
   - 8.6 [RegisterProvider + ConfigureProviderAPI](#86-registerprovider--configureproviderapi)
   - 8.7 [ViewProviderInvoice + PayProviderInvoice](#87-viewproviderinvoice--payproviderinvoice)
   - 8.8 [ViewProviderAnalytics + ExportUsageData](#88-viewprovideranalytics--exportusagedata)
   - 8.9 [ViewGlobalAnalytics](#89-viewglobalanalytics)

---

## 1. Use Case Diagram

Source: [`Use_Case.puml`](./Use_Case.puml)

```plantuml
@startuml
left to right direction
actor "EVUser" as User
actor "ProviderAdmin" as Admin
actor "PlatformOperator" as Operator
actor "Google OAuth Provider" as Google
actor "External ProviderAPI" as ExtAPI
actor "PaymentGateway" as Payment
usecase "LoginWithGoogle" as UC_Login
usecase "SearchChargers\n--\nextension points\nCreateReservation\nViewChargerDetails" as UC_Search
usecase "CreateReservation" as UC_Reserve
usecase "ViewChargerDetails" as UC_Details
usecase "CancelReservation" as UC_Cancel
usecase "StartSession" as UC_Start
usecase "StopSession" as UC_Stop
usecase "RegisterProvider" as UC_RegProv
usecase "ConfigureProviderAPI" as UC_Config
usecase "ViewProviderAnalytics\n--\nextension points\nViewProviderInvoice\nExportUsageData" as UC_ProvAn
usecase "ViewProviderInvoice\n--\nextension points\nPayProviderInvoice" as UC_ViewInv
usecase "ExportUsageData" as UC_Export
usecase "PayProviderInvoice" as UC_PayInv
usecase "ViewGlobalAnalytics" as UC_GlobAn
User ---> UC_Login
UC_Login ---> Google
User ---> UC_Search
UC_Search <.. UC_Reserve : <<extend>>
UC_Search <.. UC_Details : <<extend>>
User ---> UC_Cancel
User ---> UC_Start
User ---> UC_Stop
UC_Stop ---> Payment
Admin ---> UC_RegProv
Admin ---> UC_Config
UC_Config ---> ExtAPI
Admin ---> UC_ProvAn
UC_ProvAn <.. UC_ViewInv : <<extend>>
UC_ProvAn <.. UC_Export : <<extend>>
UC_ViewInv <.. UC_PayInv : <<extend>>
UC_PayInv ---> Payment
Operator ---> UC_GlobAn
@enduml
```

---

## 2. Activity Diagrams

Source folder: [`Activity_diagramms/`](./Activity_diagramms/)

### 2.1 Login / Search Chargers / View Charger

```plantuml
@startuml
skinparam style strictuml
|EVUser|
|saasPlug System|
|Google OAuth Provider|

|EVUser|
start
:LoginWithGoogle;
|saasPlug System|
:Redirect to Google;
|Google OAuth Provider|
:Authenticate User;
:Return OAuth Token;
|saasPlug System|
:Validate Token & Create Session;
|EVUser|
:SearchChargers;
|saasPlug System|
:Fetch Chargers from DB;
:Display Map;
|EVUser|
:ViewChargerDetails;
stop
@enduml
```

### 2.2 Create / Cancel Reservation

```plantuml
@startuml
skinparam style strictuml
|EVUser|
|saasPlug System|
|External ProviderAPI|
|EVUser|
start
:Select Charger;
:CreateReservation;
|saasPlug System|
:Check Availability via API;
|External ProviderAPI|
:reservation API;
|saasPlug System|
if (Available?) then (yes)
  :Confirm Reservation;
  :Log Billable Transaction;
  |EVUser|
  split
    :Arrive at Charger;
    stop
  split again
    :CancelReservation;
    |saasPlug System|
    :Update ReservationStatus;
    stop
  end split
else (no)
  |saasPlug System|
  :Notify User (Unavailable);
  stop
endif
@enduml
```

### 2.3 Start / Stop Session — Payment

```plantuml
@startuml
skinparam style strictuml
|EVUser|
|saasPlug System|
|External ProviderAPI|
|PaymentGateway|

|EVUser|
start
:StartSession;
|saasPlug System|
:Command: Start Charging;
|External ProviderAPI|
:start charging API;
|saasPlug System|
:Update SessionStatus (Active);
|EVUser|
:StopSession;
|saasPlug System|
:Command: Stop Charging;
|External ProviderAPI|
:stop charging API;
:Calculate Final Cost;
:Generate Invoice;
|PaymentGateway|
:Process Payment;
|saasPlug System|
:Update PaymentStatus;
stop
@enduml
```

### 2.4 Register Provider / Configure API / Analytics / Export

```plantuml
@startuml
skinparam style strictuml
|ProviderAdmin|
|saasPlug System|
|ProviderAdmin|
start
:RegisterProvider;
:ConfigureProviderAPI;
|saasPlug System|
:Verify API Connection;
:Save ProviderApiConfig;
|ProviderAdmin|
:ViewProviderAnalytics;
|saasPlug System|
:Fetch Metrics (UsageMetric);
:Generate ProviderAnalyticsReport;
|ProviderAdmin|
:ExportUsageData;
|saasPlug System|
:Generate CSV/JSON;
stop
@enduml
```

### 2.5 View / Pay Provider Invoice

```plantuml
@startuml
skinparam style strictuml
|ProviderAdmin|
|saasPlug System|
|PaymentGateway|
|ProviderAdmin|
start
:ViewProviderInvoice;
|saasPlug System|
:Fetch ProviderInvoice (SaaS billing);
|ProviderAdmin|
:PayProviderInvoice;
|saasPlug System|
:Initiate SaaS Payment;
|PaymentGateway|
:Process SaaS Payment;
|saasPlug System|
:Update ProviderPaymentStatus;
stop
@enduml
```

### 2.6 View Global Analytics

```plantuml
@startuml
skinparam style strictuml
|PlatformOperator|
|saasPlug System|
|PlatformOperator|
start
:ViewGlobalAnalytics;
|saasPlug System|
:Aggregate Data from All Providers;
:Generate GlobalAnalyticsReport;
|PlatformOperator|
:Review Platform Performance;
stop
@enduml
```

---

## 3. ER Diagram — Persistency

Source: [`ER.puml`](./ER.puml)

```plantuml
@startuml
skinparam classAttributeIconSize 0
skinparam monochrome true
skinparam linetype ortho
skinparam nodesep 50
skinparam ranksep 60

title saasPlug – Entity-Relationship Diagram

enum Role {
    EV_USER
    PROVIDER_ADMIN
    PLATFORM_OPERATOR
}
enum CarColor {
    RED
    BLUE
    YELLOW
    WHITE
    BLACK
    SILVER
    GREY
    GREEN
    ORANGE
    PURPLE
}
enum ChargerStatus {
    AVAILABLE
    IN_USE
    OUTAGE
    RESERVED
    MALFUNCTION
    OFFLINE
}
enum ConnectorType {
    CCS
    CHADEMO
    TYPE2
    TYPE1
    SCHUKO
}
enum ReservationStatus {
    ACTIVE
    EXPIRED
    CANCELLED
}
enum SessionStatus {
    RUNNING
    COMPLETED
    AUTO_STOPPED
    USER_STOPPED
    INSUFFICIENT_FUNDS
}
enum PaymentStatus {
    PREAUTHORIZED
    CAPTURED
    CANCELLED
    FAILED
}
enum ProviderStatus {
    ACTIVE
    SUSPENDED
    PENDING
}
enum SubscriptionStatus {
    ACTIVE
    CANCELLED
    PAST_DUE
}
enum ProviderInvoiceStatus {
    PENDING
    PAID
    OVERDUE
    VOID
}
enum ProviderPaymentStatus {
    PENDING
    COMPLETED
    FAILED
    REFUNDED
}
enum ExportStatus {
    PENDING
    PROCESSING
    COMPLETED
    FAILED
}
enum ExportFormat {
    CSV
    JSON
    XLSX
}
enum WebhookStatus {
    PENDING
    SENT
    FAILED
}

entity User {
    * id : Integer <<PK>>
    --
    * email : String <<unique>>
    * firstName : String
    * lastName : String
    * role : Role
    phone : String
    outstandingBalanceEur : Float
    * createdAt : Timestamp
}
entity AuthSession {
    * id : Integer <<PK>>
    --
    * userId : Integer <<FK>>
    * token : String
    * issuedAt : Timestamp
    * expiresAt : Timestamp
    provider : String
}
entity Car {
    * id : Integer <<PK>>
    --
    * brand : String
    * model : String
    * usableBatteryKWh : Float
    * acMaxKW : Float
    * dcMaxKW : Float
    dcPorts : ConnectorType[]
}
entity CarOwnership {
    * id : Integer <<PK>>
    --
    * userId : Integer <<FK>>
    * carId : Integer <<FK>>
    * color : CarColor
    licensePlate : String
    * createdAt : Timestamp
}
entity Charger {
    * id : Integer <<PK>>
    --
    * pointId : String <<unique>>
    * providerId : Integer <<FK>>
    * name : String
    * lat : Float
    * lon : Float
    * connectorType : ConnectorType
    * status : ChargerStatus
    cap : Integer
    * pricingProfileId : Integer <<FK>>
}
entity PricingProfile {
    * id : Integer <<PK>>
    --
    * name : String
    * kwhPrice : Float
    startFeeEur : Float
    minutePrice : Float
    currency : String
}
entity WholesalePricePoint {
    * id : Integer <<PK>>
    --
    * pricingProfileId : Integer <<FK>>
    * fromKW : Float
    * toKW : Float
    * pricePerKWh : Float
    * validFrom : Timestamp
    validTo : Timestamp
}
entity Reservation {
    * id : Integer <<PK>>
    --
    * userId : Integer <<FK>>
    * chargerId : Integer <<FK>>
    * status : ReservationStatus
    * startsAt : Timestamp
    * reservationEndTime : Timestamp
    paymentIntentId : String
    * createdAt : Timestamp
}
entity Session {
    * id : Integer <<PK>>
    --
    * userId : Integer <<FK>>
    * chargerId : Integer <<FK>>
    reservationId : Integer <<FK>>
    * status : SessionStatus
    * startedAt : Timestamp
    endedAt : Timestamp
    startSoc : Integer
    endSoc : Integer
    totalKWh : Float
    pricePerKWh : Float
    amount : Float
}
entity PaymentMethod {
    * id : Integer <<PK>>
    --
    * userId : Integer <<FK>>
    * provider : String
    * tokenLast4 : String
    isDefault : Boolean
    * createdAt : Timestamp
}
entity PaymentAuth {
    * id : Integer <<PK>>
    --
    * sessionId : Integer <<FK>>
    * paymentMethodId : Integer <<FK>>
    * status : PaymentStatus
    * authorizedAmountEur : Float
    capturedAmountEur : Float
    * createdAt : Timestamp
}
entity Invoice {
    * id : Integer <<PK>>
    --
    * userId : Integer <<FK>>
    * sessionId : Integer <<FK>>
    * totalEur : Float
    pdfUrl : String
    * issuedAt : Timestamp
}
entity Provider {
    * id : Integer <<PK>>
    --
    * name : String
    * email : String
    * status : ProviderStatus
    vatNumber : String
    address : String
    * createdAt : Timestamp
}
entity ProviderAccount {
    * id : Integer <<PK>>
    --
    * providerId : Integer <<FK>>
    * userId : Integer <<FK>>
    isOwner : Boolean
    * createdAt : Timestamp
}
entity ProviderApiConfig {
    * id : Integer <<PK>>
    --
    * providerId : Integer <<FK>>
    * baseUrl : String
    authToken : String
    * syncInterval : Integer
    * createdAt : Timestamp
    lastSyncedAt : Timestamp
}
entity ProviderPlan {
    * id : Integer <<PK>>
    --
    * name : String
    * monthlyFeeEur : Float
    * perSessionFeeEur : Float
    * maxChargers : Integer
}
entity ProviderSubscription {
    * id : Integer <<PK>>
    --
    * providerId : Integer <<FK>>
    * planId : Integer <<FK>>
    * status : SubscriptionStatus
    * startDate : Date
    endDate : Date
}
entity ProviderUsageRecord {
    * id : Integer <<PK>>
    --
    * providerId : Integer <<FK>>
    * billingPeriodId : Integer <<FK>>
    * totalSessions : Integer
    * totalKWh : Float
    * chargeableFeeEur : Float
    * recordedAt : Timestamp
}
entity BillingPeriod {
    * id : Integer <<PK>>
    --
    * providerId : Integer <<FK>>
    * startDate : Date
    * endDate : Date
    * isClosed : Boolean
}
entity ProviderInvoice {
    * id : Integer <<PK>>
    --
    * providerId : Integer <<FK>>
    * billingPeriodId : Integer <<FK>>
    * totalEur : Float
    * status : ProviderInvoiceStatus
    pdfUrl : String
    * issuedAt : Timestamp
    dueDate : Date
}
entity ProviderPayment {
    * id : Integer <<PK>>
    --
    * providerInvoiceId : Integer <<FK>>
    * status : ProviderPaymentStatus
    * amountEur : Float
    * paidAt : Timestamp
    transactionRef : String
}
entity ProviderAnalyticsReport {
    * id : Integer <<PK>>
    --
    * providerId : Integer <<FK>>
    * periodStart : Date
    * periodEnd : Date
    * totalSessions : Integer
    * totalKWh : Float
    * totalRevenueEur : Float
    * generatedAt : Timestamp
}
entity GlobalAnalyticsReport {
    * id : Integer <<PK>>
    --
    * periodStart : Date
    * periodEnd : Date
    * totalProviders : Integer
    * totalSessions : Integer
    * totalKWh : Float
    * platformRevenueEur : Float
    * generatedAt : Timestamp
}
entity UsageMetric {
    * id : Integer <<PK>>
    --
    * providerId : Integer <<FK>>
    * metricName : String
    * metricValue : Float
    * recordedAt : Timestamp
}
entity ExportJob {
    * id : Integer <<PK>>
    --
    * providerId : Integer <<FK>>
    * requestedBy : Integer <<FK>>
    * status : ExportStatus
    * format : ExportFormat
    * requestedAt : Timestamp
    completedAt : Timestamp
    downloadUrl : String
}
entity WebhookSubscription {
    * id : Integer <<PK>>
    --
    * providerId : Integer <<FK>>
    * targetUrl : String
    * eventType : String
    * isActive : Boolean
    * createdAt : Timestamp
}
entity WebhookEvent {
    * id : Integer <<PK>>
    --
    * subscriptionId : Integer <<FK>>
    * eventType : String
    * payload : Text
    * sentAt : Timestamp
    * status : WebhookStatus
}
entity AuditEvent {
    * id : Integer <<PK>>
    --
    userId : Integer <<FK>>
    sessionId : Integer <<FK>>
    * action : String
    * entityType : String
    entityId : Integer
    * occurredAt : Timestamp
    metadata : Text
}

User ||--o{ AuthSession : "has"
User ||--o{ CarOwnership : "owns"
CarOwnership }o--|| Car : "references"
Provider ||--o{ Charger : "manages"
Charger }o--|| PricingProfile : "uses"
PricingProfile ||--o{ WholesalePricePoint : "defines"
User ||--o{ Reservation : "creates"
Charger ||--o{ Reservation : "targeted by"
Reservation ||--o| Session : "may start"
User ||--o{ Session : "starts"
Charger ||--o{ Session : "hosts"
User ||--o{ PaymentMethod : "owns"
Session ||--|| PaymentAuth : "authorised via"
PaymentAuth }o--|| PaymentMethod : "uses"
Session ||--o| Invoice : "generates"
Invoice }o--|| User : "billed to"
Provider ||--o{ ProviderAccount : "has"
ProviderAccount }o--|| User : "linked to"
Provider ||--|| ProviderApiConfig : "configured by"
Provider ||--o{ ProviderSubscription : "subscribes"
ProviderSubscription }o--|| ProviderPlan : "using"
Provider ||--o{ BillingPeriod : "has"
BillingPeriod ||--o{ ProviderUsageRecord : "records"
BillingPeriod ||--o| ProviderInvoice : "generates"
ProviderInvoice ||--o{ ProviderPayment : "settled by"
Provider ||--o{ ProviderAnalyticsReport : "reported in"
Provider ||--o{ UsageMetric : "tracks"
Provider ||--o{ ExportJob : "requests"
ExportJob }o--|| User : "requested by"
Provider ||--o{ WebhookSubscription : "subscribes"
WebhookSubscription ||--o{ WebhookEvent : "triggers"
AuditEvent }o--o| User : "references"
AuditEvent }o--o| Session : "references"
@enduml
```

---

## 4. Class Diagram — Data Structures (DTOs & Enums)

Source: [`Class(DataStruct).puml`](<./Class(DataStruct).puml>)

```plantuml
@startuml
skinparam classAttributeIconSize 0
skinparam monochrome true
skinparam linetype ortho

package "Enums" {
    enum Role {
        EV_USER
        PROVIDER_ADMIN
        PLATFORM_OPERATOR
    }
    enum ChargerStatus {
        AVAILABLE
        IN_USE
        OUTAGE
        RESERVED
        MALFUNCTION
        OFFLINE
    }
    enum ConnectorType {
        CCS
        CHADEMO
        TYPE2
        TYPE1
        SCHUKO
    }
    enum ReservationStatus {
        ACTIVE
        EXPIRED
        CANCELLED
    }
    enum SessionStatus {
        RUNNING
        COMPLETED
        AUTO_STOPPED
        USER_STOPPED
        INSUFFICIENT_FUNDS
    }
    enum PaymentStatus {
        PREAUTHORIZED
        CAPTURED
        CANCELLED
        FAILED
    }
    enum CarColor {
        RED
        BLUE
        YELLOW
        WHITE
        BLACK
        SILVER
        GREY
        GREEN
        ORANGE
        PURPLE
    }
    enum ProviderStatus {
        PENDING
        ACTIVE
        SUSPENDED
        DISABLED
    }
    enum SubscriptionStatus {
        TRIAL
        ACTIVE
        PAST_DUE
        CANCELLED
    }
    enum ProviderInvoiceStatus {
        PENDING
        PAID
        OVERDUE
        CANCELLED
    }
    enum ProviderPaymentStatus {
        PENDING
        SUCCEEDED
        FAILED
        CANCELLED
    }
    enum ExportStatus {
        PENDING
        RUNNING
        COMPLETED
        FAILED
    }
    enum ExportFormat {
        CSV
        JSON
    }
}

package "DTOs - Identity & Vehicles" {
    class UserDto {
        + id: Integer
        + email: String
        + firstName: String
        + lastName: String
        + phone: String
        + outstandingBalanceEur: Float
        + createdAt: String
    }
    class CarDto {
        + id: Integer
        + brand: String
        + model: String
        + usableBatteryKWh: Float
        + acMaxKW: Float
        + dcMaxKW: Float
        + dcPorts: ConnectorType[]
    }
    class CarOwnershipDto {
        + id: Integer
        + userId: Integer
        + carId: Integer
        + carColor: CarColor
        + createdAt: String
    }
}

package "DTOs - Charging & Catalog" {
    class ChargerDto {
        + pointId: String
        + providerName: String
        + name: String
        + lat: Float
        + lon: Float
        + cap: Integer
        + kWhPrice: Float
    }
    class ChargerSummaryDto
    class ChargerDetailsDto
    class PricingProfileDto {
        + id: Integer
        + providerName: String
        + currency: String
        + basePricePerKWh: Float
    }
    class WholesalePricePointDto {
        + id: Integer
        + startsAt: String
        + endsAt: String
        + pricePerKWh: Float
    }
}

package "DTOs - Reservations & Sessions" {
    class ReservationDto {
        + id: Integer
        + userId: Integer
        + chargerId: Integer
        + startsAt: String
        + reservationEndTime: String
        + paymentIntentId: String
    }
    class ReservationSummaryDto
    class ReservationDetailsDto
    class SessionDto {
        + id: Integer
        + userId: Integer
        + chargerId: Integer
        + reservationId: Integer
        + startedAt: String
        + endedAt: String
        + startSoc: Integer
        + endSoc: Integer
        + totalKWh: Float
        + pricePerKWh: Float
        + amount: Float
    }
}

package "DTOs - Billing (User-side)" {
    class PaymentMethodDto {
        + id: Integer
        + userId: Integer
        + provider: String
        + tokenLast4: String
    }
    class PaymentAuthDto {
        + id: Integer
        + sessionId: Integer
        + status: PaymentStatus
        + authorizedAmountEur: Float
    }
    class InvoiceDto {
        + id: Integer
        + userId: Integer
        + sessionId: Integer
        + pdfUrl: String
        + totalEur: Float
    }
}

package "DTOs - Provider / SaaS & Analytics" {
    class ProviderDto {
        + id: Integer
        + name: String
        + status: ProviderStatus
    }
    class ProviderInvoiceDto {
        + id: Integer
        + providerId: Integer
        + totalEur: Float
        + status: ProviderInvoiceStatus
    }
    class ProviderAnalyticsReportDto {
        + totalSessions: Integer
        + totalRevenueEur: Float
        + period: String
    }
    class GlobalAnalyticsReportDto {
        + totalProviders: Integer
        + totalSessions: Integer
        + totalRevenueEur: Float
        + period: String
    }
    class ExportJobDto {
        + id: Integer
        + providerId: Integer
        + format: ExportFormat
        + status: ExportStatus
        + fileUrl: String
    }
    class ProviderApiConfigDto {
        + id: Integer
        + providerId: Integer
        + baseUrl: String
        + apiKey: String
        + clientSecret: String
    }
    class ProviderSubscriptionDto {
        + id: Integer
        + providerId: Integer
        + planName: String
        + status: SubscriptionStatus
        + startsAt: String
        + endsAt: String
    }
    class InvoiceLineDto {
        + id: Integer
        + providerInvoiceId: Integer
        + description: String
        + amountEur: Float
    }
    class ProviderPaymentDto {
        + id: Integer
        + providerInvoiceId: Integer
        + amountEur: Float
        + status: ProviderPaymentStatus
        + gatewayTransactionId: String
        + createdAt: String
    }
    class UsageMetricDto {
        + chargerId: Integer
        + date: String
        + sessionsCount: Integer
        + totalKWh: Float
        + totalRevenueEur: Float
    }
}

package "DTOs - Integration & Audit" {
    class WebhookEventDto {
        + id: Integer
        + eventType: String
        + deliveredAt: String
    }
    class AuditEventDto {
        + id: Integer
        + eventType: String
        + createdAt: String
    }
}

ChargerSummaryDto --|> ChargerDto
ChargerDetailsDto --|> ChargerDto
ReservationSummaryDto --|> ReservationDto
ReservationDetailsDto --|> ReservationDto

UserDto --> Role
CarOwnershipDto --> UserDto
CarOwnershipDto --> CarDto

ChargerDto --> ChargerStatus
ChargerDto --> ConnectorType
PricingProfileDto --> WholesalePricePointDto

ReservationDto --> UserDto
ReservationDto --> ChargerDto
ReservationDto --> ReservationStatus

SessionDto --> UserDto
SessionDto --> ChargerDto
SessionDto --> ReservationDto
SessionDto --> SessionStatus

PaymentMethodDto --> UserDto
PaymentAuthDto --> SessionDto
PaymentAuthDto --> PaymentStatus
InvoiceDto --> SessionDto
InvoiceDto --> UserDto

ProviderDto --> ProviderStatus
ProviderInvoiceDto --> ProviderDto
ProviderInvoiceDto --> ProviderInvoiceStatus
ProviderInvoiceDto --> InvoiceLineDto
ProviderAnalyticsReportDto --> ProviderDto
ProviderApiConfigDto --> ProviderDto
ProviderSubscriptionDto --> SubscriptionStatus
ProviderSubscriptionDto --> ProviderDto
ProviderPaymentDto --> ProviderPaymentStatus
ProviderPaymentDto --> ProviderInvoiceDto
ExportJobDto --> ProviderDto
ExportJobDto --> ExportStatus
ExportJobDto --> ExportFormat
UsageMetricDto --> ChargerDto
@enduml
```

---

## 5. Class Diagram — APIs (Controllers & Request/Response)

Source: [`Class(APIs).puml`](<./Class(APIs).puml>)

```plantuml
@startuml
skinparam classAttributeIconSize 0
skinparam monochrome true
skinparam linetype ortho

package "AuthService" {
    package "API Request/Response Models" {
        class GoogleLoginRequest {
            + authCode: String
        }
        class AuthTokenResponse{
            + jwt: String
            + role: Role
        }
    }
    package "REST API Controllers (Endpoints)" {
        class AuthController <<RestController>> {
            + <<POST>> /api/auth/google(req: GoogleLoginRequest): AuthTokenResponse
        }
    }
    AuthController ..up.> GoogleLoginRequest
    AuthController ..up.> AuthTokenResponse
}

package "UserService" {
    package "REST API Controllers (Endpoints)" {
        class UserController <<RestController>> {
            + <<GET>> /api/users/profile(): UserDto
            + <<PUT>> /api/users/preferences(req: Json): UserDto
        }
    }
    UserController ..up.> UserDto
}

package "VehicleService" {
    package "REST API Controllers (Endpoints)" {
        class VehicleController <<RestController>> {
            + <<GET>> /api/vehicles(): CarOwnershipDto[]
            + <<POST>> /api/vehicles(req: CarDto): CarOwnershipDto
        }
    }
    VehicleController ..up.> CarDto
    VehicleController ..up.> CarOwnershipDto
}

package "ChargerService" {
    package "API Request/Response Models" {
        class SearchChargersRequest <<QueryParams>> {
            + lat: Float
            + lon: Float
            + radiusKm: Float
        }
        class SearchChargersResponse {
            + chargers: ChargerSummaryDto[]
        }
        class GetChargerDetailsResponse {
            + charger: ChargerDetailsDto
        }
    }
    package "REST API Controllers (Endpoints)" {
        class ChargerController <<RestController>> {
            + <<GET>> /api/chargers(params: SearchChargersRequest): SearchChargersResponse
            + <<GET>> /api/chargers/{id}(id: String): GetChargerDetailsResponse
        }
    }
    ChargerController ..up.> SearchChargersRequest
    ChargerController ..up.> SearchChargersResponse
    ChargerController ..up.> GetChargerDetailsResponse
}

package "ReservationService" {
    package "API Request/Response Models" {
        class CreateReservationRequest {
            + chargerId: Integer
            + startsAt: String
            + endsAt: String
        }
        class CreateReservationResponse {
            + reservation: ReservationDto
        }
        class CancelReservationRequest {
            + reason: String
        }
        class ReservationResponse {
            + reservation: ReservationDto
        }
    }
    package "REST API Controllers (Endpoints)" {
        class ReservationController <<RestController>> {
            + <<POST>> /api/reservations(req: CreateReservationRequest): CreateReservationResponse
            + <<DELETE>> /api/reservations/{id}(req: CancelReservationRequest): ReservationResponse
        }
    }
    ReservationController ..up.> CreateReservationRequest
    ReservationController ..up.> CreateReservationResponse
    ReservationController ..up.> CancelReservationRequest
    ReservationController ..up.> ReservationResponse
}

package "SessionService" {
    package "API Request/Response Models" {
        class StartSessionRequest {
            + chargerId: Integer
            + reservationId: Integer
        }
        class StartSessionResponse {
            + session: SessionDto
        }
        class StopSessionRequest {
            + sessionId: Integer
        }
        class StopSessionResponse {
            + session: SessionDto
            + invoice: InvoiceDto
        }
    }
    package "REST API Controllers (Endpoints)" {
        class SessionController <<RestController>> {
            + <<POST>> /api/sessions/start(req: StartSessionRequest): StartSessionResponse
            + <<POST>> /api/sessions/stop(req: StopSessionRequest): StopSessionResponse
        }
    }
    SessionController ..up.> StartSessionRequest
    SessionController ..up.> StartSessionResponse
    SessionController ..up.> StopSessionRequest
    SessionController ..up.> StopSessionResponse
}

package "BillingService" {
    package "API Request/Response Models" {
        class AddPaymentMethodRequest {
            + paymentToken: String
        }
        class PaymentMethodResponse {
            + method: PaymentMethodDto
        }
        class PaymentAuthorizationResponse {
            + status: PaymentStatus
            + amountAuthorizedEur: Float
        }
        class PayProviderInvoiceRequest {
            + paymentMethodId: Integer
        }
        class PayProviderInvoiceResponse {
            + success: Boolean
        }
        class GetProviderInvoiceResponse {
            + invoice: ProviderInvoiceDto
        }
        class InvoiceResponse {
            + invoice: InvoiceDto
        }
    }
    package "REST API Controllers (Endpoints)" {
        class BillingController <<RestController>> {
            + <<POST>> /api/billing/methods(req: AddPaymentMethodRequest): PaymentMethodResponse
            + <<GET>> /api/billing/invoices/{id}(id: Integer): GetProviderInvoiceResponse
            + <<POST>> /api/billing/pay(req: PayProviderInvoiceRequest): PayProviderInvoiceResponse
        }
    }
    BillingController ..up.> AddPaymentMethodRequest
    BillingController ..up.> PaymentMethodResponse
    BillingController ..up.> PayProviderInvoiceRequest
    BillingController ..up.> PayProviderInvoiceResponse
    BillingController ..up.> GetProviderInvoiceResponse
}

package "ProviderService" {
    package "API Request/Response Models" {
        class RegisterProviderRequest {
            + name: String
            + adminEmail: String
        }
        class RegisterProviderResponse {
            + provider: ProviderDto
        }
        class ProviderProfileResponse {
            + provider: ProviderDto
        }
    }
    package "REST API Controllers (Endpoints)" {
        class ProviderController <<RestController>> {
            + <<POST>> /api/providers/register(req: RegisterProviderRequest): RegisterProviderResponse
            + <<PUT>> /api/providers/{id}/config(): ProviderProfileResponse
        }
    }
    ProviderController ..up.> RegisterProviderRequest
    ProviderController ..up.> RegisterProviderResponse
    ProviderController ..up.> ProviderProfileResponse
}

package "AnalyticsService" {
    package "API Request/Response Models" {
        class GetProviderAnalyticsRequest <<QueryParams>> {
            + startDate: String
            + endDate: String
        }
        class ProviderAnalyticsResponse {
            + report: ProviderAnalyticsReportDto
        }
        class GetGlobalAnalyticsRequest <<QueryParams>> {
            + startDate: String
            + endDate: String
        }
        class GlobalAnalyticsResponse {
            + report: GlobalAnalyticsReportDto
        }
        class ExportUsageDataRequest {
            + startDate: String
            + endDate: String
            + format: ExportFormat
        }
        class ExportUsageDataResponse {
            + job: ExportJobDto
        }
    }
    package "REST API Controllers (Endpoints)" {
        class AnalyticsController <<RestController>> {
            + <<GET>> /api/analytics/provider(params: GetProviderAnalyticsRequest): ProviderAnalyticsResponse
            + <<GET>> /api/analytics/global(params: GetGlobalAnalyticsRequest): GlobalAnalyticsResponse
            + <<POST>> /api/analytics/export(req: ExportUsageDataRequest): ExportUsageDataResponse
        }
    }
    AnalyticsController ..up.> GetProviderAnalyticsRequest
    AnalyticsController ..up.> ProviderAnalyticsResponse
    AnalyticsController ..up.> GetGlobalAnalyticsRequest
    AnalyticsController ..up.> GlobalAnalyticsResponse
    AnalyticsController ..up.> ExportUsageDataRequest
    AnalyticsController ..up.> ExportUsageDataResponse
}

package "IntegrationService" {
    package "REST API Controllers (Endpoints)" {
        class WebhookController <<RestController>> {
            + <<POST>> /api/webhooks/receive(req: WebhookEventDto): String
        }
    }
    WebhookController ..up.> WebhookEventDto
}
@enduml
```

---

## 6. Component Diagram

Source: [`Component.puml`](./Component.puml)

```plantuml
@startuml
allowmixing
skinparam monochrome true
skinparam linetype ortho
skinparam componentStyle rectangle
skinparam shadowing false

package "Client Portals" {
  component EVUserPortal <<portal>>
  component ProviderPortal <<portal>>
  component OperatorPortal <<portal>>
}

package "saasPlug Platform" {

  package "Entry Layer" {
    interface "REST API" as REST_API
    component ApiGateway <<gateway>>
  }

  package "Core Business Services" {
    interface IAuth
    interface IUserProfile
    interface IVehicleMgmt
    interface IChargerSearch
    interface IChargerAvailability
    interface IReservationMgmt
    interface ISessionMgmt
    interface IBilling
    interface IProviderMgmt

    component AuthService <<microservice>>
    component UserService <<microservice>>
    component VehicleService <<microservice>>
    component ChargerService <<microservice>>
    component ReservationService <<microservice>>
    component SessionService <<microservice>>
    component BillingService <<microservice>>
    component ProviderService <<microservice>>
  }

  package "Cross-Cutting / Downstream Services" {
    interface IAnalytics
    interface IExternalIntegration
    interface IAuditLogging

    component AnalyticsService <<reporting>>
    component IntegrationService <<integration>>
    component AuditService <<cross-cutting>>
  }

  package "Infrastructure Components" {
    component MessageBroker <<broker>>
    component ObjectStorage <<storage>>
  }
}

package "External Systems" {
  component GoogleOAuthProvider <<external>>
  component PaymentGateway <<external>>

  package "ExternalProviderAPIs" {
    component BluePlugAPI <<external>>
    component GreenPlugAPI <<external>>
    component RedPlugAPI <<external>>
  }
}

EVUserPortal ..> REST_API : <<use>>
ProviderPortal ..> REST_API : <<use>>
OperatorPortal ..> REST_API : <<use>>

REST_API <|.. ApiGateway

IAuth <|.. AuthService
IUserProfile <|.. UserService
IVehicleMgmt <|.. VehicleService
IChargerSearch <|.. ChargerService
IChargerAvailability <|.. ChargerService
IReservationMgmt <|.. ReservationService
ISessionMgmt <|.. SessionService
IBilling <|.. BillingService
IProviderMgmt <|.. ProviderService

IAnalytics <|.. AnalyticsService
IExternalIntegration <|.. IntegrationService
IAuditLogging <|.. AuditService

ApiGateway ..> IAuth : <<use>>
ApiGateway ..> IUserProfile : <<use>>
ApiGateway ..> IVehicleMgmt : <<use>>
ApiGateway ..> IChargerSearch : <<use>>
ApiGateway ..> IReservationMgmt : <<use>>
ApiGateway ..> ISessionMgmt : <<use>>
ApiGateway ..> IBilling : <<use>>
ApiGateway ..> IProviderMgmt : <<use>>
ApiGateway ..> IAnalytics : <<use>>

ReservationService ..> IChargerAvailability : <<use>>
SessionService ..> IChargerAvailability : <<use>>
SessionService ..> IReservationMgmt : <<use>>
BillingService ..> IProviderMgmt : <<use>>

AnalyticsService ..> ISessionMgmt : <<use>>
AnalyticsService ..> IProviderMgmt : <<use>>

ChargerService ..> IExternalIntegration : <<use>>
ReservationService ..> IExternalIntegration : <<use>>
SessionService ..> IExternalIntegration : <<use>>
ProviderService ..> IExternalIntegration : <<use>>

ReservationService ..> MessageBroker : publish reservation events
SessionService ..> MessageBroker : publish session events
ProviderService ..> MessageBroker : publish provider events
BillingService ..> MessageBroker : publish billing events
IntegrationService ..> MessageBroker : publish provider sync events

AuditService ..> MessageBroker : consume domain events
IntegrationService ..> MessageBroker : consume webhook events


AuthService ..> GoogleOAuthProvider : <<use>>
BillingService ..> PaymentGateway : <<use>>

IntegrationService ..> BluePlugAPI : <<use>>
IntegrationService ..> GreenPlugAPI : <<use>>
IntegrationService ..> RedPlugAPI : <<use>>

note right of ApiGateway
Single entry point for all portals.
Routes client requests to internal microservices.
end note

note right of IntegrationService
Handles ExternalProviderAPI communication,
provider synchronization,
and outbound webhooks.
end note

note right of MessageBroker
RabbitMQ-style event backbone for
loosely coupled internal communication.
end note

note right of AnalyticsService
Generates provider analytics,
global analytics,
and export jobs.
end note

note right of ObjectStorage
Stores exported usage files
and archived integration payloads.
end note
@enduml
```

---

## 7. Deployment Diagram

Source: [`Deployment.puml`](./Deployment.puml)

```plantuml
@startuml
title saasPlug - Deployment Diagram

skinparam componentStyle rectangle
skinparam shadowing false
skinparam linetype ortho
skinparam defaultTextAlignment center

legend right
  == Canonical Notes ==
  * Docker-based microservices deployment
  * Ports explicitly shown
  * Hybrid communication:
    - synchronous REST via ApiGateway
    - asynchronous messaging via RabbitMQ
  * Export files stored in MinIO
endlegend

node "Client Devices" <<device>> {
  node "EVUser Browser" as EVUserBrowser
  node "ProviderAdmin Browser" as ProviderAdminBrowser
  node "PlatformOperator Browser" as PlatformOperatorBrowser
}

cloud "GoogleOAuthProvider" as GoogleOAuthProvider
cloud "ExternalProviderAPI" as ExternalProviderAPI
cloud "PaymentGateway" as PaymentGateway

node "Docker Host / VM" <<device>> {

  node "Docker Network: saasplug-network" <<network>> {

    node "ev-user-portal-container" <<container>> {
      artifact "EVUserPortal\nReact SPA\nPort: 3000" as EVUserPortal
    }
    node "provider-portal-container" <<container>> {
      artifact "ProviderPortal\nReact SPA\nPort: 3001" as ProviderPortal
    }
    node "operator-portal-container" <<container>> {
      artifact "OperatorPortal\nReact SPA\nPort: 3002" as OperatorPortal
    }
    node "api-gateway-container" <<container>> {
      artifact "ApiGateway\nPort: 8080" as ApiGateway
    }
    node "message-broker-container" <<container>> {
      artifact "RabbitMQ MessageBroker\nAMQP: 5672\nManagement: 15672" as MessageBroker
    }
    node "auth-service-container" <<container>> {
      artifact "AuthService\nPort: 8081" as AuthService
    }
    node "user-service-container" <<container>> {
      artifact "UserService\nPort: 8082" as UserService
    }
    node "vehicle-service-container" <<container>> {
      artifact "VehicleService\nPort: 8083" as VehicleService
    }
    node "charger-service-container" <<container>> {
      artifact "ChargerService\nPort: 8084" as ChargerService
    }
    node "reservation-service-container" <<container>> {
      artifact "ReservationService\nPort: 8085" as ReservationService
    }
    node "session-service-container" <<container>> {
      artifact "SessionService\nPort: 8086" as SessionService
    }
    node "billing-service-container" <<container>> {
      artifact "BillingService\nPort: 8087" as BillingService
    }
    node "provider-service-container" <<container>> {
      artifact "ProviderService\nPort: 8088" as ProviderService
    }
    node "analytics-service-container" <<container>> {
      artifact "AnalyticsService\nPort: 8089" as AnalyticsService
    }
    node "integration-service-container" <<container>> {
      artifact "IntegrationService\nPort: 8090" as IntegrationService
    }
    node "audit-service-container" <<container>> {
      artifact "AuditService\nPort: 8091" as AuditService
    }
    node "redis-container" <<container>> {
      artifact "Redis\nPort: 6379" as Redis
    }
    node "minio-container" <<container>> {
      artifact "MinIO ObjectStorage\nAPI: 9000\nConsole: 9001" as MinIO
    }
    node "monitoring-container" <<container>> {
      artifact "Monitoring\nPrometheus / Grafana\nPorts: 9090 / 3003" as Monitoring
    }
    node "log-aggregation-container" <<container>> {
      artifact "LogAggregation\nPorts: 3100 / 5601" as LogAggregation
    }

    database "auth-db-container" <<container>> {
      artifact "Auth DB\nPort: 5433" as AuthDB
    }
    database "user-db-container" <<container>> {
      artifact "User DB\nPort: 5434" as UserDB
    }
    database "vehicle-db-container" <<container>> {
      artifact "Vehicle DB\nPort: 5435" as VehicleDB
    }
    database "charger-db-container" <<container>> {
      artifact "Charger DB\nPort: 5436" as ChargerDB
    }
    database "reservation-db-container" <<container>> {
      artifact "Reservation DB\nPort: 5437" as ReservationDB
    }
    database "session-db-container" <<container>> {
      artifact "Session DB\nPort: 5438" as SessionDB
    }
    database "billing-db-container" <<container>> {
      artifact "Billing DB\nPort: 5439" as BillingDB
    }
    database "provider-db-container" <<container>> {
      artifact "Provider DB\nPort: 5440" as ProviderDB
    }
    database "analytics-db-container" <<container>> {
      artifact "Analytics DB\nPort: 5441" as AnalyticsDB
    }
    database "integration-db-container" <<container>> {
      artifact "Integration DB\nPort: 5442" as IntegrationDB
    }
    database "audit-db-container" <<container>> {
      artifact "Audit DB\nPort: 5443" as AuditDB
    }
  }
}

EVUserBrowser --> EVUserPortal : HTTPS 443
ProviderAdminBrowser --> ProviderPortal : HTTPS 443
PlatformOperatorBrowser --> OperatorPortal : HTTPS 443

EVUserPortal --> ApiGateway : REST / JSON
ProviderPortal --> ApiGateway : REST / JSON
OperatorPortal --> ApiGateway : REST / JSON

ApiGateway --> AuthService
ApiGateway --> UserService
ApiGateway --> VehicleService
ApiGateway --> ChargerService
ApiGateway --> ReservationService
ApiGateway --> SessionService
ApiGateway --> BillingService
ApiGateway --> ProviderService
ApiGateway --> AnalyticsService
ApiGateway --> IntegrationService
ApiGateway --> AuditService

AuthService --> GoogleOAuthProvider : OAuth2
BillingService --> PaymentGateway : HTTPS
IntegrationService --> ExternalProviderAPI : HTTPS

AuthService --> AuthDB
UserService --> UserDB
VehicleService --> VehicleDB
ChargerService --> ChargerDB
ReservationService --> ReservationDB
SessionService --> SessionDB
BillingService --> BillingDB
ProviderService --> ProviderDB
AnalyticsService --> AnalyticsDB
IntegrationService --> IntegrationDB
AuditService --> AuditDB

ChargerService --> Redis : charger availability cache
ReservationService --> Redis : reservation lock / temporary hold
SessionService --> Redis : active session ephemeral state
ApiGateway --> Redis : optional token / rate-limit cache

AnalyticsService --> MinIO : store export files
IntegrationService --> MinIO : webhook payload archive

ReservationService --> MessageBroker : publish ReservationCreated / Cancelled
SessionService --> MessageBroker : publish SessionStarted / Stopped
ProviderService --> MessageBroker : publish Provider events
IntegrationService --> MessageBroker : publish ProviderSync / Webhook events

BillingService --> MessageBroker : consume Session + Provider events
AnalyticsService --> MessageBroker : consume domain events
AuditService --> MessageBroker : consume all events
IntegrationService --> MessageBroker : consume Provider sync events

ReservationService --> ChargerService : availability check
SessionService --> BillingService : invoice trigger
ProviderService --> IntegrationService : API config
AnalyticsService --> BillingService : usage data

ApiGateway --> Monitoring : metrics
AuthService --> Monitoring : metrics
UserService --> Monitoring : metrics
VehicleService --> Monitoring : metrics
ChargerService --> Monitoring : metrics
ReservationService --> Monitoring : metrics
SessionService --> Monitoring : metrics
BillingService --> Monitoring : metrics
ProviderService --> Monitoring : metrics
AnalyticsService --> Monitoring : metrics
IntegrationService --> Monitoring : metrics
AuditService --> Monitoring : metrics
MessageBroker --> Monitoring : broker metrics

ApiGateway --> LogAggregation : logs
AuthService --> LogAggregation : logs
UserService --> LogAggregation : logs
VehicleService --> LogAggregation : logs
ChargerService --> LogAggregation : logs
ReservationService --> LogAggregation : logs
SessionService --> LogAggregation : logs
BillingService --> LogAggregation : logs
ProviderService --> LogAggregation : logs
AnalyticsService --> LogAggregation : logs
IntegrationService --> LogAggregation : logs
AuditService --> LogAggregation : logs
MessageBroker --> LogAggregation : broker logs

note bottom of Redis
Redis:
- charger availability cache
- reservation lock / temporary hold
- active session ephemeral state
end note

note bottom of IntegrationService
IntegrationService:
- ExternalProviderAPI communication
- provider sync events
- outbound webhooks
end note

note bottom of MinIO
Used for ExportUsageData files
end note

note bottom of MessageBroker
RabbitMQ enables event-driven architecture
end note
@enduml
```

---

## 8. Sequence Diagrams

Source: [`Sequence.puml`](./Sequence.puml)

### 8.1 LoginWithGoogle

```plantuml
@startuml
title LoginWithGoogle - EVUser authenticates via Google OAuth

skinparam sequenceMessageAlign center
skinparam responseMessageBelowArrow true
autonumber

actor EVUser
participant Frontend
participant ApiGateway
participant AuthController
participant AuthService
participant GoogleOAuthProvider
participant UserService
participant AuditService
database "AuthDB" as AuthDB

EVUser -> Frontend : click "Sign in with Google"
Frontend -> GoogleOAuthProvider : OAuth2 authorize redirect
GoogleOAuthProvider --> EVUser : consent screen
EVUser -> GoogleOAuthProvider : approve
GoogleOAuthProvider --> Frontend : authCode (redirect_uri)

Frontend -> ApiGateway : POST /api/auth/google\nGoogleLoginRequest{authCode}
ApiGateway -> AuthController : POST /api/auth/google
AuthController -> AuthService : loginWithGoogle(GoogleLoginRequest)
AuthService -> GoogleOAuthProvider : exchangeCode(authCode)
GoogleOAuthProvider --> AuthService : idToken + googleProfile

AuthService -> UserService : getOrCreateUser(googleProfile)
UserService --> AuthService : UserDto

AuthService -> AuthDB : persist AuthSession (User, Role)
AuthService -> AuditService : log AuditEventDto{LOGIN_SUCCESS, userId}
AuthService --> AuthController : AuthTokenResponse{jwt, role}
AuthController --> ApiGateway : 200 AuthTokenResponse
ApiGateway --> Frontend : 200 AuthTokenResponse
Frontend --> EVUser : signed in
@enduml
```

### 8.2 SearchChargers + ViewChargerDetails

```plantuml
@startuml
title SearchChargers - EVUser searches available chargers

skinparam responseMessageBelowArrow true
autonumber

actor EVUser
participant Frontend
participant ApiGateway
participant AuthService
participant ChargerController
participant ChargerService
participant IntegrationService
participant ExternalProviderAPI
database "ChargerDB" as ChargerDB

EVUser -> Frontend : enter location & filters
Frontend -> ApiGateway : GET /api/chargers\nSearchChargersRequest (JWT)
ApiGateway -> AuthService : validateToken(JWT)
AuthService --> ApiGateway : ok (userId, role=EVUser)

ApiGateway -> ChargerController : GET /api/chargers
ChargerController -> ChargerService : searchChargers(SearchChargersRequest)

ChargerService -> ChargerDB : query Charger by criteria
ChargerDB --> ChargerService : Charger[] (cached metadata)

loop for each owning Provider
    ChargerService -> IntegrationService : getLiveStatus(chargerIds)
    IntegrationService -> ExternalProviderAPI : GET /chargers/status\n(per ProviderApiConfig)
    ExternalProviderAPI --> IntegrationService : ChargerStatus[]
    IntegrationService --> ChargerService : ChargerStatus[]
end

ChargerService --> ChargerController : SearchChargersResponse{ChargerSummaryDto[]}
ChargerController --> ApiGateway : 200 SearchChargersResponse
ApiGateway --> Frontend : 200 SearchChargersResponse
Frontend --> EVUser : render charger list

== ViewChargerDetails ==
EVUser -> Frontend : open charger
Frontend -> ApiGateway : GET /api/chargers/{id} (JWT)
ApiGateway -> ChargerController : GET /api/chargers/{id}
ChargerController -> ChargerService : getChargerDetails(id)
ChargerService -> ChargerDB : load Charger, PricingProfile, ConnectorType
ChargerService -> IntegrationService : getLiveStatus(id)
IntegrationService -> ExternalProviderAPI : GET /chargers/{id}/status
ExternalProviderAPI --> IntegrationService : ChargerStatus
IntegrationService --> ChargerService : ChargerStatus
ChargerService --> ChargerController : GetChargerDetailsResponse{ChargerDetailsDto}
ChargerController --> ApiGateway : 200 GetChargerDetailsResponse
ApiGateway --> Frontend : 200 GetChargerDetailsResponse
Frontend --> EVUser : show details
@enduml
```

### 8.3 CreateReservation

```plantuml
@startuml
title CreateReservation - EVUser reserves a Charger

skinparam responseMessageBelowArrow true
autonumber

actor EVUser
participant Frontend
participant ApiGateway
participant AuthService
participant ReservationController
participant ReservationService
participant ChargerService
participant IntegrationService
participant ExternalProviderAPI
participant AuditService
database "ReservationDB" as ReservationDB

EVUser -> Frontend : pick Charger + timeSlot
Frontend -> ApiGateway : POST /api/reservations\nCreateReservationRequest (JWT)
ApiGateway -> AuthService : validateToken(JWT)
AuthService --> ApiGateway : ok (userId)

ApiGateway -> ReservationController : POST /api/reservations
ReservationController -> ReservationService : createReservation(userId, CreateReservationRequest)

ReservationService -> ChargerService : checkAvailability(chargerId, timeSlot)
ChargerService -> IntegrationService : getLiveStatus(chargerId)
IntegrationService -> ExternalProviderAPI : GET /chargers/{id}/status
ExternalProviderAPI --> IntegrationService : ChargerStatus
IntegrationService --> ChargerService : ChargerStatus
ChargerService --> ReservationService : available=true | false

alt Charger available
    ReservationService -> IntegrationService : reserveSlot(chargerId, timeSlot)
    IntegrationService -> ExternalProviderAPI : POST /reservations
    ExternalProviderAPI --> IntegrationService : externalReservationId
    IntegrationService --> ReservationService : confirmed

    ReservationService -> ReservationDB : insert Reservation\n(status=ReservationStatus.ACTIVE)
    ReservationService -> AuditService : log AuditEventDto{RESERVATION_CREATED, userId, reservationId}

    ReservationService --> ReservationController : CreateReservationResponse{ReservationDto}
    ReservationController --> ApiGateway : 201 CreateReservationResponse
    ApiGateway --> Frontend : 201 CreateReservationResponse
    Frontend --> EVUser : reservation confirmed
else Slot unavailable
    ReservationService -> AuditService : log AuditEventDto{RESERVATION_FAILED, userId}
    ReservationService --> ReservationController : error CONFLICT
    ReservationController --> ApiGateway : 409 Conflict
    ApiGateway --> Frontend : 409 Conflict
    Frontend --> EVUser : "slot unavailable"
end
@enduml
```

### 8.4 CancelReservation

```plantuml
@startuml
title CancelReservation - EVUser cancels a Reservation

skinparam responseMessageBelowArrow true
autonumber

actor EVUser
participant Frontend
participant ApiGateway
participant AuthService
participant ReservationController
participant ReservationService
participant IntegrationService
participant ExternalProviderAPI
participant AuditService
database "ReservationDB" as ReservationDB

EVUser -> Frontend : cancel reservation
Frontend -> ApiGateway : DELETE /api/reservations/{id}\nCancelReservationRequest (JWT)
ApiGateway -> AuthService : validateToken(JWT)
AuthService --> ApiGateway : ok (userId)

ApiGateway -> ReservationController : DELETE /api/reservations/{id}
ReservationController -> ReservationService : cancelReservation(userId, id)

ReservationService -> ReservationDB : load Reservation
ReservationDB --> ReservationService : Reservation

alt Owner == userId AND status == ACTIVE
    ReservationService -> IntegrationService : cancelExternalReservation(externalReservationId)
    IntegrationService -> ExternalProviderAPI : DELETE /reservations/{externalId}
    ExternalProviderAPI --> IntegrationService : ok

    ReservationService -> ReservationDB : update Reservation\n(status=ReservationStatus.CANCELLED)
    ReservationService -> AuditService : log AuditEventDto{RESERVATION_CANCELLED, userId}

    ReservationService --> ReservationController : ReservationResponse{ReservationDto}
    ReservationController --> ApiGateway : 200 ReservationResponse
    ApiGateway --> Frontend : 200 ReservationResponse
    Frontend --> EVUser : cancelled
else Not owner / wrong state
    ReservationService --> ReservationController : error FORBIDDEN
    ReservationController --> ApiGateway : 403 Forbidden
    ApiGateway --> Frontend : 403 Forbidden
end
@enduml
```

### 8.5 StartSession / StopSession

```plantuml
@startuml
title StartSession & StopSession - EVUser charges and is invoiced

skinparam responseMessageBelowArrow true
autonumber

actor EVUser
participant Frontend
participant ApiGateway
participant AuthService
participant SessionController
participant SessionService
participant ReservationService
participant IntegrationService
participant ExternalProviderAPI
participant BillingService
participant PaymentGateway
participant AuditService
database "SessionDB" as SessionDB

== StartSession ==
EVUser -> Frontend : plug in & start
Frontend -> ApiGateway : POST /api/sessions/start\nStartSessionRequest (JWT)
ApiGateway -> AuthService : validateToken(JWT)
AuthService --> ApiGateway : ok (userId)

ApiGateway -> SessionController : POST /api/sessions/start
SessionController -> SessionService : startSession(userId, StartSessionRequest)

SessionService -> ReservationService : getReservation(reservationId)
ReservationService --> SessionService : ReservationDto

SessionService -> BillingService : authorizePayment(userId, estimatedAmount)
BillingService -> PaymentGateway : authorize(PaymentMethodDto, amount)
PaymentGateway --> BillingService : PaymentAuthDto{status=PaymentStatus.PREAUTHORIZED}
BillingService --> SessionService : PaymentAuthorizationResponse

SessionService -> IntegrationService : startExternalSession(chargerId)
IntegrationService -> ExternalProviderAPI : POST /sessions/start
ExternalProviderAPI --> IntegrationService : externalSessionId

SessionService -> SessionDB : insert Session\n(status=SessionStatus.RUNNING)
SessionService -> AuditService : log AuditEventDto{SESSION_STARTED, userId, sessionId}

SessionService --> SessionController : StartSessionResponse{SessionDto}
SessionController --> ApiGateway : 200 StartSessionResponse
ApiGateway --> Frontend : 200 StartSessionResponse
Frontend --> EVUser : charging started

== StopSession ==
EVUser -> Frontend : stop charging
Frontend -> ApiGateway : POST /api/sessions/stop\nStopSessionRequest (JWT)
ApiGateway -> SessionController : POST /api/sessions/stop
SessionController -> SessionService : stopSession(userId, StopSessionRequest)

SessionService -> IntegrationService : stopExternalSession(externalSessionId)
IntegrationService -> ExternalProviderAPI : POST /sessions/stop
ExternalProviderAPI --> IntegrationService : finalKwh, durationSec

SessionService -> SessionDB : update Session\n(status=SessionStatus.COMPLETED, kwh, duration)

SessionService -> BillingService : finalizeCharge(sessionId, finalKwh)
BillingService -> PaymentGateway : capture(PaymentAuthDto, finalAmount)
PaymentGateway --> BillingService : PaymentStatus.CAPTURED
BillingService -> BillingService : generate Invoice (InvoiceDto)
BillingService -> AuditService : log AuditEventDto{INVOICE_ISSUED, userId, invoiceId}
BillingService --> SessionService : InvoiceResponse

SessionService --> SessionController : StopSessionResponse{SessionDto, InvoiceDto}
SessionController --> ApiGateway : 200 StopSessionResponse
ApiGateway --> Frontend : 200 StopSessionResponse
Frontend --> EVUser : session ended + invoice
@enduml
```

### 8.6 RegisterProvider + ConfigureProviderAPI

```plantuml
@startuml
title RegisterProvider - ProviderAdmin registers and configures API access

skinparam responseMessageBelowArrow true
autonumber

actor ProviderAdmin
participant Frontend
participant ApiGateway
participant AuthService
participant ProviderController
participant ProviderService
participant IntegrationService
participant ExternalProviderAPI
participant BillingService
participant AuditService
database "ProviderDB" as ProviderDB

ProviderAdmin -> Frontend : open registration form
Frontend -> ApiGateway : POST /api/providers/register\nRegisterProviderRequest
ApiGateway -> ProviderController : POST /api/providers/register
ProviderController -> ProviderService : registerProvider(RegisterProviderRequest)

ProviderService -> AuthService : createProviderAccount(email)
AuthService --> ProviderService : UserDto{role=Role.PROVIDER_ADMIN}

ProviderService -> ProviderDB : insert Provider, ProviderAccount\n(status=ProviderStatus.PENDING)
ProviderService -> BillingService : createSubscription(providerId, plan)
BillingService --> ProviderService : ProviderSubscriptionDto{status=SubscriptionStatus.ACTIVE}

ProviderService -> AuditService : log AuditEventDto{PROVIDER_REGISTERED, providerId}
ProviderService --> ProviderController : RegisterProviderResponse{ProviderDto}
ProviderController --> ApiGateway : 201 RegisterProviderResponse
ApiGateway --> Frontend : 201 RegisterProviderResponse
Frontend --> ProviderAdmin : show next step (configure API)

== ConfigureProviderAPI ==
ProviderAdmin -> Frontend : enter API base URL + credentials
Frontend -> ApiGateway : PUT /api/providers/{id}/config (JWT)
ApiGateway -> AuthService : validateToken(JWT, role=PROVIDER_ADMIN)
AuthService --> ApiGateway : ok

ApiGateway -> ProviderController : PUT /api/providers/{id}/config
ProviderController -> ProviderService : updateApiConfig(providerId, ProviderApiConfigDto)

ProviderService -> ProviderDB : upsert ProviderApiConfig
ProviderService -> IntegrationService : testConnection(ProviderApiConfigDto)
IntegrationService -> ExternalProviderAPI : GET /health
ExternalProviderAPI --> IntegrationService : 200 OK
IntegrationService --> ProviderService : reachable

ProviderService -> ProviderDB : update Provider\n(status=ProviderStatus.ACTIVE)
ProviderService -> AuditService : log AuditEventDto{PROVIDER_API_CONFIGURED, providerId}

ProviderService --> ProviderController : ProviderProfileResponse{ProviderDto}
ProviderController --> ApiGateway : 200 ProviderProfileResponse
ApiGateway --> Frontend : 200 ProviderProfileResponse
Frontend --> ProviderAdmin : provider active
@enduml
```

### 8.7 ViewProviderInvoice + PayProviderInvoice

```plantuml
@startuml
title ViewProviderInvoice + PayProviderInvoice - ProviderAdmin settles SaaS invoice

skinparam responseMessageBelowArrow true
autonumber

actor ProviderAdmin
participant Frontend
participant ApiGateway
participant AuthService
participant BillingController
participant BillingService
participant PaymentGateway
participant AuditService
database "BillingDB" as BillingDB

== ViewProviderInvoice ==
ProviderAdmin -> Frontend : open invoices
Frontend -> ApiGateway : GET /api/billing/invoices/{id} (JWT)
ApiGateway -> AuthService : validateToken(JWT, role=PROVIDER_ADMIN)
AuthService --> ApiGateway : ok (providerId)
ApiGateway -> BillingController : GET /api/billing/invoices/{id}
BillingController -> BillingService : getProviderInvoice(providerId, id)
BillingService -> BillingDB : load ProviderInvoice + InvoiceLine[]
BillingService --> BillingController : GetProviderInvoiceResponse{ProviderInvoiceDto}
BillingController --> ApiGateway : 200 GetProviderInvoiceResponse
ApiGateway --> Frontend : 200 GetProviderInvoiceResponse
Frontend --> ProviderAdmin : show invoice

== PayProviderInvoice ==
ProviderAdmin -> Frontend : confirm payment
Frontend -> ApiGateway : POST /api/billing/pay\nPayProviderInvoiceRequest (JWT)
ApiGateway -> BillingController : POST /api/billing/pay
BillingController -> BillingService : payProviderInvoice(providerId, PayProviderInvoiceRequest)

BillingService -> BillingDB : load ProviderInvoice\n(status=ProviderInvoiceStatus.PENDING)
BillingService -> PaymentGateway : charge(PaymentMethodDto, amount)
PaymentGateway --> BillingService : ProviderPaymentDto{status=ProviderPaymentStatus.SUCCEEDED}

alt Payment succeeded
    BillingService -> BillingDB : insert ProviderPayment\nupdate ProviderInvoice\n(status=ProviderInvoiceStatus.PAID)
    BillingService -> AuditService : log AuditEventDto{PROVIDER_INVOICE_PAID, providerId}
    BillingService --> BillingController : PayProviderInvoiceResponse{success}
    BillingController --> ApiGateway : 200 PayProviderInvoiceResponse
    ApiGateway --> Frontend : 200 PayProviderInvoiceResponse
    Frontend --> ProviderAdmin : payment confirmed
else Payment failed
    BillingService -> BillingDB : insert ProviderPayment\n(status=ProviderPaymentStatus.FAILED)
    BillingService -> AuditService : log AuditEventDto{PROVIDER_PAYMENT_FAILED, providerId}
    BillingService --> BillingController : error PAYMENT_FAILED
    BillingController --> ApiGateway : 402 Payment Required
    ApiGateway --> Frontend : 402 Payment Required
    Frontend --> ProviderAdmin : payment failed
end
@enduml
```

### 8.8 ViewProviderAnalytics + ExportUsageData

```plantuml
@startuml
title ViewProviderAnalytics + ExportUsageData - ProviderAdmin

skinparam responseMessageBelowArrow true
autonumber

actor ProviderAdmin
participant Frontend
participant ApiGateway
participant AuthService
participant AnalyticsController
participant AnalyticsService
participant ProviderService
participant SessionService
participant AuditService
database "AnalyticsDB" as AnalyticsDB
queue "ExportQueue" as ExportQueue
database "ObjectStore" as ObjectStore

== ViewProviderAnalytics ==
ProviderAdmin -> Frontend : open analytics dashboard
Frontend -> ApiGateway : GET /api/analytics/provider\nGetProviderAnalyticsRequest (JWT)
ApiGateway -> AuthService : validateToken(JWT, role=PROVIDER_ADMIN)
AuthService --> ApiGateway : ok (providerId)

ApiGateway -> AnalyticsController : GET /api/analytics/provider
AnalyticsController -> AnalyticsService : getProviderAnalytics(providerId, range)

AnalyticsService -> ProviderService : getProviderChargers(providerId)
ProviderService --> AnalyticsService : chargerIds[]

AnalyticsService -> SessionService : getUsageMetrics(chargerIds, range)
SessionService --> AnalyticsService : UsageMetricDto[]

AnalyticsService -> AnalyticsDB : upsert ProviderAnalyticsReport
AnalyticsService --> AnalyticsController : ProviderAnalyticsResponse{ProviderAnalyticsReportDto}
AnalyticsController --> ApiGateway : 200 ProviderAnalyticsResponse
ApiGateway --> Frontend : 200 ProviderAnalyticsResponse
Frontend --> ProviderAdmin : render charts

== ExportUsageData ==
ProviderAdmin -> Frontend : "Export CSV"
Frontend -> ApiGateway : POST /api/analytics/export\nExportUsageDataRequest (JWT)
ApiGateway -> AnalyticsController : POST /api/analytics/export
AnalyticsController -> AnalyticsService : requestExport(providerId, ExportUsageDataRequest)

AnalyticsService -> AnalyticsDB : insert ExportJob\n(status=ExportStatus.PENDING)
AnalyticsService -> ExportQueue : enqueue(exportJobId)
AnalyticsService -> AuditService : log AuditEventDto{EXPORT_REQUESTED, providerId, exportJobId}
AnalyticsService --> AnalyticsController : ExportUsageDataResponse{ExportJobDto}
AnalyticsController --> ApiGateway : 202 ExportUsageDataResponse
ApiGateway --> Frontend : 202 Accepted
Frontend --> ProviderAdmin : "export queued"

== Async export worker ==
ExportQueue -> AnalyticsService : dequeue(exportJobId)
AnalyticsService -> SessionService : streamUsage(providerId, range)
SessionService --> AnalyticsService : rows[]
AnalyticsService -> ObjectStore : write file (ExportFormat.CSV)
ObjectStore --> AnalyticsService : downloadUrl
AnalyticsService -> AnalyticsDB : update ExportJob\n(status=ExportStatus.COMPLETED, downloadUrl)
AnalyticsService -> AuditService : log AuditEventDto{EXPORT_READY, exportJobId}
@enduml
```

### 8.9 ViewGlobalAnalytics

```plantuml
@startuml
title ViewGlobalAnalytics - PlatformOperator

skinparam responseMessageBelowArrow true
autonumber

actor PlatformOperator
participant Frontend
participant ApiGateway
participant AuthService
participant AnalyticsController
participant AnalyticsService
participant ProviderService
participant SessionService
participant BillingService
participant AuditService
database "AnalyticsDB" as AnalyticsDB

PlatformOperator -> Frontend : open global dashboard
Frontend -> ApiGateway : GET /api/analytics/global\nGetGlobalAnalyticsRequest (JWT)
ApiGateway -> AuthService : validateToken(JWT, role=PLATFORM_OPERATOR)
AuthService --> ApiGateway : ok

ApiGateway -> AnalyticsController : GET /api/analytics/global
AnalyticsController -> AnalyticsService : getGlobalAnalytics(range)

par
    AnalyticsService -> ProviderService : getActiveProviders()
    ProviderService --> AnalyticsService : Provider[]
also
    AnalyticsService -> SessionService : getGlobalUsageMetrics(range)
    SessionService --> AnalyticsService : UsageMetricDto[]
also
    AnalyticsService -> BillingService : getRevenueSummary(range)
    BillingService --> AnalyticsService : revenueTotals
end

AnalyticsService -> AnalyticsDB : upsert GlobalAnalyticsReport
AnalyticsService -> AuditService : log AuditEventDto{GLOBAL_ANALYTICS_VIEWED}
AnalyticsService --> AnalyticsController : GlobalAnalyticsResponse{GlobalAnalyticsReportDto}
AnalyticsController --> ApiGateway : 200 GlobalAnalyticsResponse
ApiGateway --> Frontend : 200 GlobalAnalyticsResponse
Frontend --> PlatformOperator : render KPIs
@enduml
```

## Additional Project Documents

- Canonical naming and consistency sheet: [canonical-naming.md](canonical-naming.md)
- Reuse and migration plan from the previous EV charger project: [reuse-plan-from-softeng25-02.md](reuse-plan-from-softeng25-02.md)
- PlantUML model for the SaaS assignment: [saasplug-uml.md](saasplug-uml.md)
