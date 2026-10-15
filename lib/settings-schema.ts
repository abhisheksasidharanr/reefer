// Settings shapes + defaults. Shared by server and client (no server imports here).

export interface GeneralSettings {
  siteName: string;
  tempUnit: 'C' | 'F';
  /** A reefer with no data for this long is "offline" */
  offlineAfterSec: number;
  /** Readings older than this are purged */
  retentionDays: number;
  /** Store a reading at most every N seconds per reefer (0 = every message) */
  sampleEverySec: number;
  /** Register unknown devices automatically instead of listing them under "Discovered" */
  autoRegister: boolean;
  /** Default allowed deviation from set point (°C) */
  defaultTolerance: number;
  timezone: string;
}

export interface MqttSettings {
  /** builtin = this app runs the broker; external = connect to another broker */
  mode: 'builtin' | 'external';
  builtinPort: number;
  /** Optional credentials devices must use on the built-in broker */
  builtinUsername: string;
  builtinPassword: string;
  url: string;
  username: string;
  password: string;
  clientId: string;
  /** Subscription, MQTT wildcards allowed */
  topic: string;
  qos: 0 | 1 | 2;
  /** Command topic template; {deviceId} is replaced */
  commandTopic: string;
  commandsEnabled: boolean;
}

/** Where each canonical field comes from in the JSON payload (dot paths, e.g. "data.temp.supply"). */
export interface MappingSettings {
  /** "payload:<path>" or "topic:<segment index>" */
  deviceId: string;
  timestamp: string;
  setTemp: string;
  supplyTemp: string;
  returnTemp: string;
  humidity: string;
  voltage: string;
  current: string;
  power: string;
  faultCode: string;
  mode: string;
  runHours: string;
  /** Temperatures in the payload are Fahrenheit */
  payloadFahrenheit: boolean;
}

export interface NotifySettings {
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  emailFrom: string;
  emailTo: string;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  /** Show browser notifications + sound in the app for these severities */
  inAppSeverities: ('info' | 'warning' | 'critical')[];
  sound: boolean;
}

export interface AllSettings {
  general: GeneralSettings;
  mqtt: MqttSettings;
  mapping: MappingSettings;
  notify: NotifySettings;
}

export const DEFAULTS: AllSettings = {
  general: {
    siteName: 'Reefer Monitor',
    tempUnit: 'C',
    offlineAfterSec: 300,
    retentionDays: 90,
    sampleEverySec: 0,
    autoRegister: false,
    defaultTolerance: 2,
    timezone: 'Asia/Dubai',
  },
  mqtt: {
    mode: 'builtin',
    builtinPort: 1883,
    builtinUsername: '',
    builtinPassword: '',
    url: 'mqtt://localhost:1883',
    username: '',
    password: '',
    clientId: 'reefer-monitor',
    topic: 'reefer/+/telemetry',
    qos: 1,
    commandTopic: 'reefer/{deviceId}/command',
    commandsEnabled: true,
  },
  mapping: {
    deviceId: 'payload:containerNo',
    timestamp: 'at',
    setTemp: 'settemp',
    supplyTemp: 'sstemp',
    returnTemp: 'rstemp',
    humidity: 'humidity',
    voltage: 'voltage',
    current: 'current',
    power: 'coolerstate',
    faultCode: 'faultcode',
    mode: 'workmode',
    runHours: 'worktime',
    payloadFahrenheit: false,
  },
  notify: {
    emailEnabled: false,
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    emailFrom: 'reefer-monitor@localhost',
    emailTo: '',
    webhookEnabled: false,
    webhookUrl: '',
    webhookSecret: '',
    inAppSeverities: ['warning', 'critical'],
    sound: true,
  },
};

export type SettingsKey = keyof AllSettings;

/** Canonical telemetry fields, with labels for the mapping UI. */
export const MAPPED_FIELDS: { key: keyof Omit<MappingSettings, 'payloadFahrenheit'>; label: string; hint: string }[] = [
  { key: 'deviceId', label: 'Device ID', hint: 'payload:<path> or topic:<segment>' },
  { key: 'timestamp', label: 'Timestamp', hint: 'ISO string or epoch (s/ms); empty = time received' },
  { key: 'setTemp', label: 'Set point', hint: '°C' },
  { key: 'supplyTemp', label: 'Supply air', hint: '°C' },
  { key: 'returnTemp', label: 'Return air', hint: '°C' },
  { key: 'humidity', label: 'Humidity', hint: '%' },
  { key: 'voltage', label: 'Voltage', hint: 'V' },
  { key: 'current', label: 'Current', hint: 'A' },
  { key: 'power', label: 'Power / running', hint: '1/0, true/false, "on"/"off"' },
  { key: 'faultCode', label: 'Fault code', hint: '0 = no fault' },
  { key: 'mode', label: 'Operating mode', hint: 'text' },
  { key: 'runHours', label: 'Run hours', hint: 'h' },
];

/** Secrets never leave the server in plain text. */
export const SECRET_FIELDS: Partial<Record<SettingsKey, string[]>> = {
  mqtt: ['password', 'builtinPassword'],
  notify: ['smtpPass', 'webhookSecret'],
};
export const MASK = '••••••••';
