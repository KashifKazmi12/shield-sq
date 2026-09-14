
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 6.2.0
 * Query Engine version: 4123509d24aa4dede1e864b46351bf2790323b69
 */
Prisma.prismaVersion = {
  client: "6.2.0",
  engine: "4123509d24aa4dede1e864b46351bf2790323b69"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.CompanyScalarFieldEnum = {
  id: 'id',
  name: 'name',
  slug: 'slug',
  createdAt: 'createdAt',
  suspendedAt: 'suspendedAt',
  features: 'features',
  ownerId: 'ownerId'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  passwordHash: 'passwordHash',
  role: 'role',
  companyId: 'companyId',
  createdAt: 'createdAt',
  onboardedAt: 'onboardedAt'
};

exports.Prisma.ProjectScalarFieldEnum = {
  id: 'id',
  companyId: 'companyId',
  name: 'name',
  createdAt: 'createdAt'
};

exports.Prisma.IngestTokenScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  tokenHash: 'tokenHash',
  label: 'label',
  createdAt: 'createdAt',
  revokedAt: 'revokedAt'
};

exports.Prisma.ScanScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  source: 'source',
  repo: 'repo',
  pipelineId: 'pipelineId',
  branch: 'branch',
  commitSha: 'commitSha',
  status: 'status',
  idempotencyKey: 'idempotencyKey',
  createdAt: 'createdAt',
  rawPayload: 'rawPayload'
};

exports.Prisma.FindingScalarFieldEnum = {
  id: 'id',
  scanId: 'scanId',
  projectId: 'projectId',
  tool: 'tool',
  severity: 'severity',
  title: 'title',
  description: 'description',
  resource: 'resource',
  fixedVersion: 'fixedVersion',
  ruleName: 'ruleName',
  detectedAt: 'detectedAt',
  status: 'status',
  openIntervals: 'openIntervals',
  dedupeKey: 'dedupeKey',
  rawContext: 'rawContext',
  aiPriorityScore: 'aiPriorityScore',
  aiPriorityReason: 'aiPriorityReason'
};

exports.Prisma.ScanFindingScalarFieldEnum = {
  id: 'id',
  scanId: 'scanId',
  findingId: 'findingId',
  observedAt: 'observedAt'
};

exports.Prisma.AlertNotificationScalarFieldEnum = {
  id: 'id',
  findingId: 'findingId',
  channel: 'channel',
  sentAt: 'sentAt',
  status: 'status'
};

exports.Prisma.NotificationConfigScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  slackWebhookUrl: 'slackWebhookUrl',
  notifyEmail: 'notifyEmail',
  severityThreshold: 'severityThreshold',
  updatedAt: 'updatedAt'
};

exports.Prisma.IngestAuditLogScalarFieldEnum = {
  id: 'id',
  source: 'source',
  projectId: 'projectId',
  reason: 'reason',
  detail: 'detail',
  createdAt: 'createdAt'
};

exports.Prisma.AdminAuditLogScalarFieldEnum = {
  id: 'id',
  companyId: 'companyId',
  actorEmail: 'actorEmail',
  action: 'action',
  detail: 'detail',
  createdAt: 'createdAt'
};

exports.Prisma.MonitoredIdentityScalarFieldEnum = {
  id: 'id',
  companyId: 'companyId',
  createdById: 'createdById',
  identifierType: 'identifierType',
  identifierValue: 'identifierValue',
  status: 'status',
  checkIntervalMins: 'checkIntervalMins',
  lastCheckedAt: 'lastCheckedAt',
  nextCheckAt: 'nextCheckAt',
  lastError: 'lastError',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LeakFindingScalarFieldEnum = {
  id: 'id',
  identityId: 'identityId',
  source: 'source',
  breachName: 'breachName',
  severity: 'severity',
  leakedAt: 'leakedAt',
  dedupeKey: 'dedupeKey',
  details: 'details',
  passwordCiphertext: 'passwordCiphertext',
  passwordPwned: 'passwordPwned',
  passwordPwnedCount: 'passwordPwnedCount',
  createdAt: 'createdAt'
};

exports.Prisma.IdentityFindingScalarFieldEnum = {
  id: 'id',
  identityId: 'identityId',
  type: 'type',
  severity: 'severity',
  title: 'title',
  description: 'description',
  status: 'status',
  detectedAt: 'detectedAt',
  dedupeKey: 'dedupeKey'
};

exports.Prisma.CompanyNotificationConfigScalarFieldEnum = {
  id: 'id',
  companyId: 'companyId',
  slackWebhookUrl: 'slackWebhookUrl',
  notifyEmail: 'notifyEmail',
  severityThreshold: 'severityThreshold',
  updatedAt: 'updatedAt'
};

exports.Prisma.MonitoredSiteScalarFieldEnum = {
  id: 'id',
  companyId: 'companyId',
  url: 'url',
  domain: 'domain',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  checkIntervalMins: 'checkIntervalMins',
  lastCheckedAt: 'lastCheckedAt',
  nextCheckAt: 'nextCheckAt'
};

exports.Prisma.SiteFindingScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  type: 'type',
  severity: 'severity',
  title: 'title',
  description: 'description',
  status: 'status',
  detectedAt: 'detectedAt',
  dedupeKey: 'dedupeKey'
};

exports.Prisma.MonitoredEndpointScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  url: 'url',
  path: 'path',
  createdAt: 'createdAt'
};

exports.Prisma.SiteScanResultScalarFieldEnum = {
  id: 'id',
  siteId: 'siteId',
  endpointId: 'endpointId',
  statusCode: 'statusCode',
  latencyMs: 'latencyMs',
  scannedAt: 'scannedAt'
};

exports.Prisma.LeakProviderConfigScalarFieldEnum = {
  id: 'id',
  provider: 'provider',
  apiKeyCiphertext: 'apiKeyCiphertext',
  apiKeyPreview: 'apiKeyPreview',
  priority: 'priority',
  enabled: 'enabled',
  usageCount: 'usageCount',
  updatedAt: 'updatedAt',
  updatedById: 'updatedById'
};

exports.Prisma.LeakProviderUsageScalarFieldEnum = {
  id: 'id',
  provider: 'provider',
  companyId: 'companyId',
  userId: 'userId',
  success: 'success',
  createdAt: 'createdAt'
};

exports.Prisma.LeakProviderLimitsScalarFieldEnum = {
  id: 'id',
  globalDailyLimit: 'globalDailyLimit',
  perCompanyDailyLimit: 'perCompanyDailyLimit',
  perUserDailyLimit: 'perUserDailyLimit',
  updatedAt: 'updatedAt'
};

exports.Prisma.AiProviderConfigScalarFieldEnum = {
  id: 'id',
  companyId: 'companyId',
  provider: 'provider',
  apiKeyCiphertext: 'apiKeyCiphertext',
  apiKeyPreview: 'apiKeyPreview',
  model: 'model',
  isActive: 'isActive',
  updatedAt: 'updatedAt'
};

exports.Prisma.AiUsageLogScalarFieldEnum = {
  id: 'id',
  companyId: 'companyId',
  provider: 'provider',
  model: 'model',
  promptTokens: 'promptTokens',
  completionTokens: 'completionTokens',
  totalTokens: 'totalTokens',
  success: 'success',
  detail: 'detail',
  createdAt: 'createdAt'
};

exports.Prisma.AiInsightScalarFieldEnum = {
  id: 'id',
  companyId: 'companyId',
  kind: 'kind',
  findingId: 'findingId',
  provider: 'provider',
  model: 'model',
  prompt: 'prompt',
  content: 'content',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.CompanyFeature = exports.$Enums.CompanyFeature = {
  vulnerabilities: 'vulnerabilities',
  runtime_alerts: 'runtime_alerts',
  leak_checking: 'leak_checking',
  url_monitoring: 'url_monitoring',
  ai_assistant: 'ai_assistant'
};

exports.Role = exports.$Enums.Role = {
  super_admin: 'super_admin',
  admin: 'admin',
  viewer: 'viewer'
};

exports.LeakIdentifierType = exports.$Enums.LeakIdentifierType = {
  email: 'email',
  username: 'username'
};

exports.MonitorStatus = exports.$Enums.MonitorStatus = {
  pending: 'pending',
  active: 'active',
  disabled: 'disabled',
  error: 'error'
};

exports.LeakProvider = exports.$Enums.LeakProvider = {
  checkleaked: 'checkleaked',
  leakcheck: 'leakcheck'
};

exports.AiProvider = exports.$Enums.AiProvider = {
  anthropic: 'anthropic',
  openai: 'openai',
  xai: 'xai',
  google: 'google'
};

exports.Prisma.ModelName = {
  Company: 'Company',
  User: 'User',
  Project: 'Project',
  IngestToken: 'IngestToken',
  Scan: 'Scan',
  Finding: 'Finding',
  ScanFinding: 'ScanFinding',
  AlertNotification: 'AlertNotification',
  NotificationConfig: 'NotificationConfig',
  IngestAuditLog: 'IngestAuditLog',
  AdminAuditLog: 'AdminAuditLog',
  MonitoredIdentity: 'MonitoredIdentity',
  LeakFinding: 'LeakFinding',
  IdentityFinding: 'IdentityFinding',
  CompanyNotificationConfig: 'CompanyNotificationConfig',
  MonitoredSite: 'MonitoredSite',
  SiteFinding: 'SiteFinding',
  MonitoredEndpoint: 'MonitoredEndpoint',
  SiteScanResult: 'SiteScanResult',
  LeakProviderConfig: 'LeakProviderConfig',
  LeakProviderUsage: 'LeakProviderUsage',
  LeakProviderLimits: 'LeakProviderLimits',
  AiProviderConfig: 'AiProviderConfig',
  AiUsageLog: 'AiUsageLog',
  AiInsight: 'AiInsight'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
