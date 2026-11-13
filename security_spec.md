# Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership**: Every document under `/users/{userId}` and its subcollections (`private`, `progress`, `overrides`, `insights`) belongs exclusively to `userId == request.auth.uid` with `request.auth.token.email_verified == true`.
2. **Parent Anchor Master Gate**: Subcollection documents under `/users/{userId}/*` require the parent `/users/{userId}` document to exist with `uid == request.auth.uid`.
3. **PII Isolation**: User email, display name, and avatar URL live exclusively in `/users/{userId}/private/profile`, never in `/users/{userId}` or public collections.
4. **Immutable Ownership & Timestamps**: `uid` / `ownerId` and `createdAt` cannot be modified after creation. All `createdAt` and `updatedAt` timestamps must strictly equal `request.time`.
5. **Bounded Payloads**: Every string, ID, number, and array is strictly bounded (`size()`, numeric range, regex `^[a-zA-Z0-9_\-]+$`, and enum validation) to prevent shadow fields and resource exhaustion.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read**: `GET /users/uidA/progress/1` with `auth = null`.
2. **Cross-user read**: `GET /users/uidA/progress/1` with `auth.uid = 'uidB'`.
3. **Unverified email write**: `CREATE /users/uidA/progress/1` with `email_verified = false`.
4. **Owner spoofing**: `CREATE /users/uidA/progress/1` with `ownerId: 'uidB'`.
5. **Shadow / ghost field injection**: `CREATE /users/uidA/private/profile` with extra `isAdmin: true`.
6. **Immutable `createdAt` tampering on update**: `UPDATE /users/uidA/private/profile` changing `createdAt`.
7. **Client-forged `updatedAt` timestamp**: `UPDATE /users/uidA/progress/1` with `updatedAt: 1700000000000` instead of `request.time`.
8. **Oversized ID poisoning**: `CREATE /users/uidA/progress/<129-char-id>` or non-matching regex ID.
9. **Oversized string DoS**: `CREATE /users/uidA/overrides/1` with `viMeaning` length 600 (> 500).
10. **Invalid enum status**: `CREATE /users/uidA/progress/1` with `status: 'hacked'`.
11. **Out-of-bounds array**: `CREATE /users/uidA/insights/1` with 20 `characterBreakdown` items (> 12).
12. **PII leak into non-private doc**: `CREATE /users/uidA` with `email: 'victim@example.com'`.
