// The whole Make app in one place. `npm run build` writes the component files under app/ from this file, and
// `npm run upload` sends app/ to Make. Edit this file, never app/ by hand.
//
// Two connections, one per product, because each key works only with its own API: an Instant Snap key
// (wsw_api_...) for captures, an Auto Schedule key (wsw_autoapi_...) for "Capture a Scheduled Page Now". Each
// connection checks its key with GET /account (which never returns the key and costs no capture) and stores its
// API's base address, so the Base, the modules and the webhooks work the same with either.

export const APP = {
  name: 'website-screenshot-world',
  label: 'Website Screenshot World',
  description:
    'Screenshots, PDFs, videos and readable text of any web page, and events from scheduled captures, change detection and deliveries.',
  theme: '#4f46e5',
  language: 'en',
  audience: 'global',
};

const INSTANT_SNAP_BASE = 'https://api.websitescreenshotworld.com/instant-snap/v1';
const AUTO_SCHEDULE_BASE = 'https://autoapi.websitescreenshotworld.com/auto-schedule/v1';

/** Every request that carries the key sends it in this header, and every log hides it. */
const KEY_HEADER = { 'x-api-key': '{{connection.apiKey}}' };
const SANITIZE = ['request.headers.x-api-key'];

// The API answers a refusal with { success: false, error_code, error_message }.
const ERROR_MESSAGE =
  "[{{statusCode}}] {{ifempty(body.error_message, 'The request was refused.')}} ({{ifempty(body.error_code, 'no error code')}})";

/**
 * The Base: the connection's API address and the error message. The key is NOT set here but on each request,
 * because a capture's file is downloaded from a signed link on another host, which must never receive the key.
 */
export const BASE = {
  baseUrl: '{{connection.apiBase}}',
  headers: { 'user-agent': 'websitescreenshotworld-make' },
  response: { error: { message: ERROR_MESSAGE } },
  log: { sanitize: SANITIZE },
};

const connection = (product, label, prefix, apiBase) => ({
  label,
  type: 'basic',
  parameters: [
    {
      name: 'apiKey',
      type: 'password',
      label: `${product} API key`,
      required: true,
      help: `Create one in the Website Screenshot World dashboard, under Developer Tools, API Keys. It starts with \`${prefix}\`.`,
    },
  ],
  api: {
    url: `${apiBase}/account`,
    method: 'GET',
    headers: { 'x-api-key': '{{parameters.apiKey}}' },
    response: {
      error: { message: ERROR_MESSAGE },
      data: { apiBase },
      // "you@example.com (Laptop)": who created the key, and its name or prefix. Never the key itself.
      metadata: {
        type: 'text',
        value: "{{ifempty(body.email, 'Former member')}} ({{ifempty(body.key_name, body.key_prefix)}})",
      },
    },
    log: { sanitize: ['request.headers.x-api-key'] },
  },
});

export const CONNECTIONS = {
  instantSnap: connection('Instant Snap', 'Website Screenshot World (Instant Snap)', 'wsw_api_', INSTANT_SNAP_BASE),
  autoSchedule: connection(
    'Auto Schedule',
    'Website Screenshot World (Auto Schedule)',
    'wsw_autoapi_',
    AUTO_SCHEDULE_BASE,
  ),
};

// ---------------------------------------------------------------------------------------------------------------
// Capture modules
// ---------------------------------------------------------------------------------------------------------------

const UNFINISHED = "temp.status === 'queued' || temp.status === 'running' || temp.status === 'pending'";

/** The capture's details, as every capture module outputs them. `from` is where the capture object is. */
const captureFields = (from) => ({
  id: `{{${from}.id}}`,
  status: `{{${from}.status}}`,
  url: `{{${from}.url}}`,
  media_category: `{{${from}.media_category}}`,
  format: `{{${from}.format}}`,
  content_type: `{{${from}.content_type}}`,
  size_bytes: `{{${from}.size_bytes}}`,
  width: `{{${from}.width}}`,
  height: `{{${from}.height}}`,
  duration_ms: `{{${from}.duration_ms}}`,
  page_http_status: `{{${from}.page_http_status}}`,
  captured_at: `{{${from}.captured_at}}`,
  final_url: `{{${from}.final_url}}`,
  media_sha256: `{{${from}.media_sha256}}`,
  download_url: `{{${from}.download_url}}`,
  expires_at: `{{${from}.expires_at}}`,
  error_code: `{{${from}.error_code}}`,
});

const CAPTURE_INTERFACE = [
  { name: 'id', type: 'text', label: 'Capture ID' },
  { name: 'status', type: 'text', label: 'Status' },
  { name: 'url', type: 'url', label: 'URL' },
  { name: 'media_category', type: 'text', label: 'Media category' },
  { name: 'format', type: 'text', label: 'Format' },
  { name: 'content_type', type: 'text', label: 'Content type' },
  { name: 'size_bytes', type: 'uinteger', label: 'Size (bytes)' },
  { name: 'width', type: 'uinteger', label: 'Width' },
  { name: 'height', type: 'uinteger', label: 'Height' },
  { name: 'duration_ms', type: 'uinteger', label: 'Duration (ms)' },
  { name: 'page_http_status', type: 'uinteger', label: 'Page HTTP status' },
  { name: 'captured_at', type: 'date', label: 'Captured at' },
  { name: 'final_url', type: 'url', label: 'Final URL' },
  { name: 'media_sha256', type: 'text', label: 'SHA-256 of the file' },
  { name: 'download_url', type: 'url', label: 'Download URL (valid for 60 minutes)' },
  { name: 'expires_at', type: 'date', label: 'File expires at' },
  { name: 'error_code', type: 'text', label: 'Error code' },
];

const FILE_INTERFACE = [
  { name: 'fileName', type: 'filename', label: 'File name', semantic: 'file:name' },
  { name: 'data', type: 'buffer', label: 'Data', semantic: 'file:data' },
];

const CAPTURE_SAMPLE = {
  id: '3f6c2a1e-9b8d-4c7e-a5f4-1d2e3c4b5a69',
  status: 'succeeded',
  url: 'https://example.com',
  media_category: 'image',
  format: 'png',
  content_type: 'image/png',
  size_bytes: 482113,
  width: 1920,
  height: 1080,
  duration_ms: 4210,
  page_http_status: 200,
  captured_at: '2026-09-26T10:30:04.512Z',
  final_url: null,
  media_sha256: '9f2c000000000000000000000000000000000000000000000000000000000000',
  download_url: 'https://media.websitescreenshotworld.com/example.png',
  expires_at: '2026-09-27T10:30:04.512Z',
  error_code: null,
};

const urlField = {
  name: 'url',
  type: 'url',
  label: 'URL',
  required: true,
  help: 'The full address of the page, such as `https://example.com/pricing`.',
};

const deviceFields = [
  {
    name: 'device_category',
    type: 'select',
    label: 'Device',
    options: [
      { label: 'Desktop', value: 'desktop' },
      { label: 'Mobile', value: 'mobile' },
    ],
    default: 'desktop',
  },
  {
    name: 'emulated_device',
    type: 'text',
    label: 'Emulated device',
    help: 'For a mobile capture: a device such as "iPhone 15 Pro" or "Pixel 7". Default "iPhone 13".',
  },
  {
    name: 'viewport',
    type: 'collection',
    label: 'Window size',
    help: 'In CSS pixels, 250 to 7680. Default 1920 × 1080.',
    spec: [
      { name: 'width', type: 'uinteger', label: 'Width' },
      { name: 'height', type: 'uinteger', label: 'Height' },
    ],
  },
];

const blockingFields = [
  { name: 'block_ads', type: 'boolean', label: 'Block ads', default: true },
  { name: 'block_pop_ups', type: 'boolean', label: 'Block pop-ups and cookie banners', default: true },
];

const selectorFields = (withHideAndElement) => [
  {
    name: 'selectors',
    type: 'collection',
    label: 'Page elements',
    spec: [
      ...(withHideAndElement
        ? [
            {
              name: 'hide',
              type: 'text',
              label: 'Hide elements',
              help: 'Comma-separated CSS selectors to hide first, such as `.chat-widget, #banner`.',
            },
          ]
        : []),
      { name: 'click', type: 'text', label: 'Click element', help: 'A CSS selector to click first, such as a "Load more" button.' },
      ...(withHideAndElement === 'image'
        ? [{ name: 'xpath', type: 'text', label: 'Only this element (XPath)', help: 'Capture only what this XPath selects, such as `//main`.' }]
        : []),
    ],
  },
];

const placeFields = [
  { name: 'locale', type: 'text', label: 'Locale', help: 'Such as `en-GB` or `de-DE`.' },
  { name: 'time_zone', type: 'text', label: 'Time zone', help: 'Such as `Europe/London`.' },
  {
    name: 'proxy',
    type: 'collection',
    label: 'Capture from another country',
    help: 'Needs a plan with proxy locations.',
    spec: [{ name: 'country', type: 'text', label: 'Country', required: true, help: 'Such as `gb` or `de`.' }],
  },
];

const commonBody = {
  device_category: '{{parameters.device_category}}',
  emulated_device: '{{parameters.emulated_device}}',
  viewport: '{{parameters.viewport}}',
  block_ads: '{{parameters.block_ads}}',
  block_pop_ups: '{{parameters.block_pop_ups}}',
  selectors: '{{parameters.selectors}}',
  locale: '{{parameters.locale}}',
  time_zone: '{{parameters.time_zone}}',
  proxy: '{{parameters.proxy}}',
};

/**
 * A capture module: start the capture asynchronously, read it every 3 seconds until it has finished (a capture that
 * fails stops the module with the API's reason; a failed capture is not charged), then fetch the file or the text
 * from its signed link, without the key. A capture still running when the polling budget is spent is returned
 * as it is, with its id, so a later "Get a Capture" can pick it up.
 */
const captureModule = ({ label, description, mediaCategory, body, expect, pollLimit, download }) => ({
  typeId: 4,
  label,
  description,
  connection: 'instantSnap',
  expect: [urlField, ...expect],
  api: [
    {
      url: '/captures',
      method: 'POST',
      headers: KEY_HEADER,
      body: { url: '{{parameters.url}}', media_category: mediaCategory, response_type: 'json', async: true, ...body },
      response: { temp: { id: '{{body.id}}', status: '{{body.status}}', capture: '{{body}}' } },
      log: { sanitize: SANITIZE },
    },
    {
      condition: `{{${UNFINISHED}}}`,
      url: '/captures/{{temp.id}}',
      method: 'GET',
      headers: KEY_HEADER,
      repeat: { condition: `{{${UNFINISHED}}}`, delay: 3000, limit: pollLimit },
      response: {
        temp: { status: '{{body.status}}', capture: '{{body}}' },
        valid: "{{body.status !== 'failed' && body.status !== 'timed_out' && body.status !== 'expired'}}",
        error: {
          message:
            "The capture ended {{body.status}} ({{ifempty(body.error_code, 'no error code')}}; the page answered HTTP {{ifempty(body.page_http_status, 'nothing')}}). Failed captures are not charged.",
        },
        output: captureFields('body'),
      },
      log: { sanitize: SANITIZE },
    },
    {
      condition: "{{temp.status === 'succeeded'}}",
      url: '{{temp.capture.download_url}}',
      method: 'GET',
      response: {
        type: download.type,
        output: { ...captureFields('temp.capture'), ...download.output },
      },
    },
  ],
  interface: [...CAPTURE_INTERFACE, ...download.interface],
  samples: { ...CAPTURE_SAMPLE, ...download.sample },
});

const binaryDownload = (fileName) => ({
  type: 'binary',
  output: { fileName, data: '{{body}}' },
  interface: FILE_INTERFACE,
  sample: { fileName: 'capture-3f6c2a1e-9b8d-4c7e-a5f4-1d2e3c4b5a69.png', data: 'IMTBuffer(482113, binary, 9f2c0000)' },
});

export const MODULES = {
  takeScreenshot: captureModule({
    label: 'Take a Screenshot',
    description: 'Takes a screenshot of a web page as PNG, JPEG, WebP or TIFF.',
    mediaCategory: 'image',
    expect: [
      {
        name: 'format',
        type: 'select',
        label: 'Format',
        options: [
          { label: 'PNG', value: 'png' },
          { label: 'JPEG', value: 'jpeg' },
          { label: 'WebP', value: 'webp' },
          { label: 'TIFF', value: 'tiff' },
        ],
        default: 'png',
      },
      { name: 'full_page', type: 'boolean', label: 'Full page', default: false, help: 'The whole page from top to bottom, not only the window.' },
      ...deviceFields,
      ...blockingFields,
      ...selectorFields('image'),
      ...placeFields,
    ],
    body: {
      format: '{{parameters.format}}',
      scroll_mode: "{{if(parameters.full_page, 'scroll', 'viewport')}}",
      ...commonBody,
    },
    pollLimit: 40,
    download: binaryDownload('capture-{{temp.capture.id}}.{{temp.capture.format}}'),
  }),

  createPdf: captureModule({
    label: 'Create a PDF',
    description: 'Creates a PDF of a web page, with selectable text or exactly as it looks on screen.',
    mediaCategory: 'pdf',
    expect: [
      {
        name: 'format',
        type: 'select',
        label: 'PDF type',
        options: [
          { label: 'Document (selectable, searchable text)', value: 'document_pdf' },
          { label: 'Image (exactly as on screen)', value: 'image_pdf' },
        ],
        default: 'document_pdf',
      },
      { name: 'full_page', type: 'boolean', label: 'Full page', default: false, help: 'For an image PDF: the whole page in one PDF.' },
      ...deviceFields,
      ...blockingFields,
      ...selectorFields(true),
      ...placeFields,
    ],
    body: {
      format: '{{parameters.format}}',
      // A document PDF is laid out page by page and is never a scrolling capture; the API refuses that.
      scroll_mode: "{{if(parameters.full_page && parameters.format === 'image_pdf', 'scroll', 'viewport')}}",
      ...commonBody,
    },
    pollLimit: 40,
    download: binaryDownload('capture-{{temp.capture.id}}.pdf'),
  }),

  recordVideo: captureModule({
    label: 'Record a Video',
    description: 'Records a video of a web page scrolling from top to bottom, on plans that include video.',
    mediaCategory: 'video',
    expect: [
      {
        name: 'format',
        type: 'select',
        label: 'Format',
        options: [
          { label: 'MP4', value: 'mp4' },
          { label: 'WebM', value: 'webm' },
          { label: 'MOV', value: 'mov' },
          { label: 'GIF', value: 'gif' },
        ],
        default: 'mp4',
      },
      ...deviceFields,
      ...blockingFields,
      ...selectorFields(true),
      ...placeFields,
    ],
    body: { format: '{{parameters.format}}', ...commonBody },
    pollLimit: 80,
    download: binaryDownload('capture-{{temp.capture.id}}.{{temp.capture.format}}'),
  }),

  getPageContent: captureModule({
    label: 'Get Page Content',
    description: "Reads a web page's main content as Markdown or plain text, without menus, cookie banners or scripts.",
    mediaCategory: 'content',
    expect: [
      {
        name: 'format',
        type: 'select',
        label: 'Format',
        options: [
          { label: 'Markdown', value: 'markdown' },
          { label: 'Plain text', value: 'text' },
        ],
        default: 'markdown',
      },
      ...deviceFields,
      ...blockingFields,
      ...selectorFields(false),
      ...placeFields,
    ],
    body: { format: '{{parameters.format}}', ...commonBody },
    pollLimit: 40,
    download: {
      type: 'text',
      output: { content: '{{body}}' },
      interface: [{ name: 'content', type: 'text', label: 'Content' }],
      sample: { content: '# Example Domain\n\nThis domain is for use in documentation examples.' },
    },
  }),

  getCapture: {
    typeId: 4,
    label: 'Get a Capture',
    description: 'Reads a capture back by its ID, with a fresh download link.',
    connection: 'instantSnap',
    expect: [
      {
        name: 'capture_id',
        type: 'text',
        label: 'Capture ID',
        required: true,
        help: 'The ID a capture module or a capture event returned. Files are kept for 24 hours.',
      },
    ],
    api: {
      url: '/captures/{{encodeURL(parameters.capture_id)}}',
      method: 'GET',
      headers: KEY_HEADER,
      response: { output: captureFields('body') },
      log: { sanitize: SANITIZE },
    },
    interface: CAPTURE_INTERFACE,
    samples: CAPTURE_SAMPLE,
  },

  captureScheduledPageNow: {
    typeId: 4,
    label: 'Capture a Scheduled Page Now',
    description:
      'Starts the capture of a web page set up in Auto Schedule now. The result arrives as a capture event.',
    connection: 'autoSchedule',
    expect: [
      {
        name: 'web_page_id',
        type: 'text',
        label: 'Web page ID',
        required: true,
        help: 'Shown on the schedule in the dashboard, and sent as `schedule_id` in events.',
      },
    ],
    api: {
      url: '/web-pages/{{encodeURL(parameters.web_page_id)}}/trigger-now',
      method: 'POST',
      headers: KEY_HEADER,
      // The API reads nothing from the body; Make's editor expects a POST to have one.
      body: {},
      response: {
        output: {
          status: '{{body.status}}',
          web_page_id: '{{body.web_page_id}}',
          triggered_by: '{{body.triggered_by}}',
          triggered_at: '{{body.triggered_at}}',
          message: '{{body.message}}',
        },
      },
      log: { sanitize: SANITIZE },
    },
    interface: [
      { name: 'status', type: 'text', label: 'Status (triggered or already_pending)' },
      { name: 'web_page_id', type: 'text', label: 'Web page ID' },
      { name: 'triggered_by', type: 'text', label: 'Triggered by' },
      { name: 'triggered_at', type: 'date', label: 'Triggered at' },
      { name: 'message', type: 'text', label: 'Message' },
    ],
    samples: {
      status: 'triggered',
      web_page_id: '7d4e2b1a-6c5f-4a3e-9d8c-2b1a0f9e8d7c',
      triggered_by: 'api',
      triggered_at: '2026-09-26T10:30:00.000Z',
      message: 'A capture of this page was queued.',
    },
  },

  makeApiCall: {
    typeId: 12,
    label: 'Make an API Call',
    description: 'Performs any Instant Snap API call with your key.',
    connection: 'instantSnap',
    expect: [
      {
        name: 'url',
        type: 'text',
        label: 'URL',
        required: true,
        help: 'A path relative to `https://api.websitescreenshotworld.com/instant-snap/v1`, such as `/captures` or `/account`.',
      },
      {
        name: 'method',
        type: 'select',
        label: 'Method',
        required: true,
        default: 'GET',
        options: ['GET', 'POST', 'DELETE'].map((value) => ({ label: value, value })),
      },
      {
        name: 'headers',
        type: 'array',
        label: 'Headers',
        help: 'The API key is added for you.',
        spec: [
          { name: 'key', type: 'text', label: 'Key' },
          { name: 'value', type: 'text', label: 'Value' },
        ],
      },
      {
        name: 'qs',
        type: 'array',
        label: 'Query string',
        spec: [
          { name: 'key', type: 'text', label: 'Key' },
          { name: 'value', type: 'text', label: 'Value' },
        ],
      },
      { name: 'body', type: 'any', label: 'Body', help: 'A JSON body, for POST.' },
    ],
    api: {
      url: '{{parameters.url}}',
      method: '{{parameters.method}}',
      headers: {
        '{{...}}': "{{toCollection(parameters.headers, 'key', 'value')}}",
        'x-api-key': '{{connection.apiKey}}',
      },
      qs: { '{{...}}': "{{toCollection(parameters.qs, 'key', 'value')}}" },
      body: '{{parameters.body}}',
      type: 'json',
      response: { output: { body: '{{body}}', headers: '{{headers}}', statusCode: '{{statusCode}}' } },
      log: { sanitize: SANITIZE },
    },
    interface: [
      { name: 'body', type: 'any', label: 'Body' },
      { name: 'headers', type: 'collection', label: 'Headers' },
      { name: 'statusCode', type: 'number', label: 'Status code' },
    ],
    samples: null,
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Events: one webhook and one instant trigger per event
// ---------------------------------------------------------------------------------------------------------------

/**
 * The events, as the webhook endpoints API names them. Each trigger's webhook is added to the organization when
 * the scenario's webhook is created (POST /webhook-endpoints) and deleted with it, the same API the Zapier app
 * uses. `sample` names the spec's example delivery the trigger's sample and interface come from.
 */
export const EVENTS = [
  {
    key: 'captureSucceeded',
    event: 'capture.succeeded',
    label: 'Watch Captures Succeeded',
    description: 'Triggers when a capture finishes, from a schedule or from the Instant Snap API.',
    products: true,
    samples: ['auto-schedule.capture.succeeded', 'instant-snap.capture.succeeded'],
  },
  {
    key: 'captureFailed',
    event: 'capture.failed',
    label: 'Watch Captures Failed',
    description: 'Triggers when a capture fails, from a schedule or from the Instant Snap API.',
    products: true,
    samples: ['auto-schedule.capture.failed', 'instant-snap.capture.failed'],
  },
  {
    key: 'pageChanged',
    event: 'capture.changed',
    label: 'Watch Page Changes',
    description: 'Triggers when a scheduled page looks different from its previous capture, with the change percentage.',
    samples: ['auto-schedule.capture.changed'],
  },
  {
    key: 'deliveryCompleted',
    event: 'delivery.completed',
    label: 'Watch Deliveries Completed',
    description: 'Triggers when a capture has been delivered to your cloud storage (S3, Google Drive or Dropbox).',
    samples: ['auto-schedule.delivery.completed'],
  },
  {
    key: 'schedulePaused',
    event: 'schedule.paused',
    label: 'Watch Schedules Paused',
    description: 'Triggers when a schedule is paused, for example because the plan has no captures left.',
    samples: ['auto-schedule.schedule.paused'],
  },
  {
    key: 'sitemapRunCompleted',
    event: 'sitemap_run.completed',
    label: 'Watch Sitemap Runs Completed',
    description: 'Triggers when every page of a sitemap schedule run has been captured or skipped.',
    samples: ['auto-schedule.sitemap_run.completed'],
  },
];

export const PRODUCT_PARAMETER = {
  name: 'product',
  type: 'select',
  label: 'Product',
  help: 'Only this product’s captures. Leave empty for both.',
  options: [
    { label: 'Auto Schedule (scheduled pages)', value: 'auto_schedule' },
    { label: 'Instant Snap API', value: 'instant_snap' },
  ],
};

export const GROUPS = [
  { label: 'Captures', modules: ['takeScreenshot', 'createPdf', 'recordVideo', 'getPageContent', 'getCapture'] },
  { label: 'Auto Schedule', modules: ['captureScheduledPageNow'] },
  { label: 'Events', modules: EVENTS.map((event) => `watch${event.key[0].toUpperCase()}${event.key.slice(1)}`) },
  { label: 'Other', modules: ['makeApiCall'] },
];

export const SANITIZE_KEY = SANITIZE;
