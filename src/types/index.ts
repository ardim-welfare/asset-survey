/**
 * 도메인 타입 통합 re-export
 *
 * 사용법: import type { User, Organization } from '../types';
 */

export type { FirestoreTimestamp, TimestampField, FirestoreDoc } from './common';
export type { User, UserRole, CreateUserData, MemberStatus, UnifiedMember } from './user';
export type { Organization, OrgStatus, CreateOrgData, SurveyMode } from './organization';
export type { AuditLog, AuditAction, AuditTargetType, AuditActorSource } from './auditLog';
export type { Broadcast, BroadcastStatus } from './broadcast';
export type { Notification } from './notification';
export type { Feedback, FeedbackStatus } from './feedback';
export type { Space, SpacePatch } from './space';
