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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const INSTANT_SNAP_BASE = 'https://api.websitescreenshotworld.com/instant-snap/v1';
const AUTO_SCHEDULE_BASE = 'https://autoapi.websitescreenshotworld.com/auto-schedule/v1';

/** The key travels in this header, set once in the Base; every log hides it. */
const SANITIZE = ['request.headers.x-api-key'];

/**
 * Set on the one request that goes to another host: a capture's file is downloaded from a signed link on the media
 * host, which must never receive the key. A request's own header replaces the Base's (checked live on 15 Nov 2026:
 * with this override the API answered 401 "X-Api-Key is invalid").
 */
const NO_KEY = { 'x-api-key': '' };

// The API answers a refusal with { success: false, error_code, error_message }.
const ERROR_MESSAGE =
  "[{{statusCode}}] {{ifempty(body.error_message, 'The request was refused.')}} ({{ifempty(body.error_code, 'no error code')}})";

/**
 * The Base: the connection's API address, the key, the error message and the log rule, inherited by every module
 * and webhook. Both connections store apiKey and apiBase, so the same Base serves both products.
 */
export const BASE = {
  baseUrl: '{{connection.apiBase}}',
  headers: { 'user-agent': 'websitescreenshotworld-make', 'x-api-key': '{{connection.apiKey}}' },
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

/** The API's dates are ISO 8601 in UTC with milliseconds, such as 2026-09-26T10:30:04.512Z. */
const ISO_8601 = 'YYYY-MM-DDTHH:mm:ss.SSSZ';

/** IML that turns the API's date at `path` into a Make date, and leaves an empty one empty. */
export const dateOf = (path) => `{{if(${path}, parseDate(${path}, '${ISO_8601}'), ${path})}}`;

/** The API's examples (from the spec repository's fixtures), used as the modules' samples. */
const apiExample = (name) => JSON.parse(readFileSync(join(import.meta.dirname, '..', 'samples', 'api', `${name}.json`), 'utf8'));

/** A capture as GET /captures/{id} returns it, field by field, with the types Make should show. */
export const CAPTURE_INTERFACE = [
  { name: 'success', type: 'boolean', label: 'Success' },
  { name: 'id', type: 'text', label: 'Capture ID' },
  { name: 'url', type: 'url', label: 'URL' },
  { name: 'status', type: 'text', label: 'Status' },
  { name: 'response_type', type: 'text', label: 'Response type' },
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
  {
    name: 'page_source',
    type: 'collection',
    label: 'Page source',
    spec: [
      { name: 'format', type: 'text', label: 'Format' },
      { name: 'content_type', type: 'text', label: 'Content type' },
      { name: 'size_bytes', type: 'uinteger', label: 'Size (bytes)' },
      { name: 'sha256', type: 'text', label: 'SHA-256' },
      { name: 'download_url', type: 'url', label: 'Download URL' },
    ],
  },
  {
    name: 's3_delivery',
    type: 'collection',
    label: 'Bucket delivery',
    spec: [
      { name: 'status', type: 'text', label: 'Status' },
      { name: 'bucket', type: 'text', label: 'Bucket' },
      { name: 'key', type: 'text', label: 'Key' },
      { name: 'access_key_id', type: 'text', label: 'Access key ID (last four characters)' },
      { name: 'error', type: 'text', label: 'Error' },
    ],
  },
  { name: 'callback_url', type: 'url', label: 'Callback URL' },
  { name: 'error_code', type: 'text', label: 'Error code' },
  { name: 'spec_version', type: 'text', label: 'API version' },
];

/** The capture as the API returned it, with its two dates parsed. `from` is where the capture object is. */
const captureOutput = (from) => ({
  '{{...}}': `{{${from}}}`,
  captured_at: dateOf(`${from}.captured_at`),
  expires_at: dateOf(`${from}.expires_at`),
});

const FILE_INTERFACE = [
  { name: 'fileName', type: 'filename', label: 'File name', semantic: 'file:name' },
  { name: 'data', type: 'buffer', label: 'Data', semantic: 'file:data' },
];

const CAPTURE_SAMPLE = apiExample('capture');

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
    // Not required: Make would then insist on it even when the block is left empty.
    spec: [{ name: 'country', type: 'text', label: 'Country', help: 'Such as `gb` or `de`. Leave empty for the default location.' }],
  },
];

/**
 * The request body: every parameter the user filled in, as the API names it, so a new API option needs only a new
 * parameter. Left out: full_page (it becomes scroll_mode) and, unless a country is given, the proxy block, because
 * Make sends a collection left empty as {} and the API refuses a proxy block without a country.
 */
export const PARAMETERS_BODY =
  "{{if(parameters.proxy.country, omit(parameters, 'full_page'), omit(parameters, 'full_page', 'proxy'))}}";

/** What the module says when a capture did not succeed, from the capture as the API returned it. */
const UNSUCCESSFUL =
  "{{if(body.status === 'queued' || body.status === 'running' || body.status === 'pending', 'The capture has not finished yet; read it later with Get a capture. ', '')}}" +
  "Capture {{body.id}}: {{body.status}} ({{ifempty(body.error_code, 'no error code')}}; page HTTP status {{ifempty(body.page_http_status, 'none')}}). Failed captures are not charged.";

/**
 * A capture module:
 * 1. start the capture asynchronously;
 * 2. read it every 3 seconds while it is pending, queued or running (an HTTP error keeps the Base's message);
 * 3. if it did not succeed (failed, timed_out, expired, or still running when the polling budget is spent, or
 *    already final in the answer to step 1), read it once more and stop with an error that says why;
 * 4. fetch the file or the text from its signed link, without the key, and output the capture with it.
 * The API's final statuses are succeeded, failed, timed_out and expired (and delivered, only for by_format
 * captures, which this app never asks for).
 */
const captureModule = ({ label, description, mediaCategory, body, expect, pollLimit, download, sample = {} }) => ({
  typeId: 4,
  label,
  description,
  connection: 'instantSnap',
  expect: [urlField, ...expect],
  api: [
    {
      url: '/captures',
      method: 'POST',
      // The spread comes first: keys after it are the app's own and win over a parameter of the same name.
      body: { '{{...}}': PARAMETERS_BODY, media_category: mediaCategory, response_type: 'json', async: true, ...body },
      response: { temp: { id: '{{body.id}}', status: '{{body.status}}', capture: '{{body}}' } },
    },
    {
      condition: `{{${UNFINISHED}}}`,
      url: '/captures/{{temp.id}}',
      method: 'GET',
      repeat: { condition: `{{${UNFINISHED}}}`, delay: 3000, limit: pollLimit },
      response: { temp: { status: '{{body.status}}', capture: '{{body}}' } },
    },
    {
      condition: "{{temp.status !== 'succeeded'}}",
      url: '/captures/{{temp.id}}',
      method: 'GET',
      response: {
        temp: { status: '{{body.status}}', capture: '{{body}}' },
        valid: { condition: "{{body.status === 'succeeded'}}", message: UNSUCCESSFUL },
      },
    },
    {
      condition: "{{temp.status === 'succeeded'}}",
      url: '{{temp.capture.download_url}}',
      method: 'GET',
      headers: NO_KEY,
      response: {
        type: download.type,
        output: { ...captureOutput('temp.capture'), ...download.output },
      },
    },
  ],
  interface: [...CAPTURE_INTERFACE, ...download.interface],
  // Each module's sample describes its own kind of capture, so the mapping panel shows what the module returns.
  samples: { ...CAPTURE_SAMPLE, ...sample, ...download.sample },
});

const binaryDownload = (fileName, extension, size) => ({
  type: 'binary',
  output: { fileName, data: '{{body}}' },
  interface: FILE_INTERFACE,
  sample: { fileName: `capture-${CAPTURE_SAMPLE.id}.${extension}`, data: `IMTBuffer(${size}, binary, 9f2c0000)` },
});

export const MODULES = {
  takeScreenshot: captureModule({
    label: 'Take a screenshot',
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
    body: { scroll_mode: "{{if(parameters.full_page, 'scroll', 'viewport')}}" },
    pollLimit: 40,
    download: binaryDownload('capture-{{temp.capture.id}}.{{temp.capture.format}}', 'png', CAPTURE_SAMPLE.size_bytes),
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
      // A document PDF is laid out page by page and is never a scrolling capture; the API refuses that.
      scroll_mode: "{{if(parameters.full_page && parameters.format === 'image_pdf', 'scroll', 'viewport')}}",
    },
    pollLimit: 40,
    sample: {
      media_category: 'pdf',
      format: 'document_pdf',
      content_type: 'application/pdf',
      size_bytes: 167077,
      width: null,
      height: null,
      download_url: 'https://media.websitescreenshotworld.com/example.pdf',
    },
    download: binaryDownload('capture-{{temp.capture.id}}.pdf', 'pdf', 167077),
  }),

  recordVideo: captureModule({
    label: 'Record a video',
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
    body: {},
    pollLimit: 80,
    sample: {
      media_category: 'video',
      format: 'mp4',
      content_type: 'video/mp4',
      size_bytes: 2841600,
      width: null,
      height: null,
      duration_ms: 18640,
      download_url: 'https://media.websitescreenshotworld.com/example.mp4',
    },
    download: binaryDownload('capture-{{temp.capture.id}}.{{temp.capture.format}}', 'mp4', 2841600),
  }),

  getPageContent: captureModule({
    label: 'Get page content',
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
    body: {},
    pollLimit: 40,
    sample: {
      media_category: 'content',
      format: 'markdown',
      content_type: 'text/markdown; charset=utf-8',
      size_bytes: 72,
      width: null,
      height: null,
      download_url: 'https://media.websitescreenshotworld.com/example.md',
    },
    download: {
      type: 'text',
      output: { content: '{{body}}' },
      interface: [{ name: 'content', type: 'text', label: 'Content' }],
      sample: { content: '# Example Domain\n\nThis domain is for use in documentation examples.' },
    },
  }),

  getCapture: {
    typeId: 4,
    label: 'Get a capture',
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
      response: { output: captureOutput('body') },
    },
    interface: CAPTURE_INTERFACE,
    samples: CAPTURE_SAMPLE,
  },

  captureScheduledPageNow: {
    typeId: 4,
    label: 'Capture a scheduled page now',
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
      // The API reads nothing from the body; Make's editor expects a POST to have one.
      body: {},
      response: { output: { '{{...}}': '{{body}}', triggered_at: dateOf('body.triggered_at') } },
    },
    interface: [
      { name: 'success', type: 'boolean', label: 'Success' },
      { name: 'status', type: 'text', label: 'Status (triggered or already_pending)' },
      { name: 'web_page_id', type: 'text', label: 'Web page ID' },
      { name: 'triggered_by', type: 'text', label: 'Triggered by (api or ui)' },
      { name: 'triggered_at', type: 'date', label: 'Triggered at' },
      { name: 'message', type: 'text', label: 'Message' },
    ],
    samples: apiExample('trigger-now'),
  },

  makeApiCall: {
    typeId: 12,
    label: 'Make an API call',
    description: 'Performs an arbitrary authorized API call.',
    connection: 'instantSnap',
    expect: [
      {
        name: 'url',
        type: 'text',
        label: 'URL',
        required: true,
        help: 'A path relative to `https://api.websitescreenshotworld.com/instant-snap/v1`. For example: `/captures` or `/account`.',
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
      // Always the Instant Snap API: the user's path is appended to the fixed address (Make removes a leading
      // slash), so a full URL typed by the user can never send the key to another host.
      url: `${INSTANT_SNAP_BASE}/{{parameters.url}}`,
      method: '{{parameters.method}}',
      headers: { '{{...}}': "{{toCollection(parameters.headers, 'key', 'value')}}" },
      qs: { '{{...}}': "{{toCollection(parameters.qs, 'key', 'value')}}" },
      body: '{{parameters.body}}',
      type: 'json',
      response: { output: { body: '{{body}}', headers: '{{headers}}', statusCode: '{{statusCode}}' } },
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
 * uses. `samples` names the spec's example deliveries the trigger's sample and interface come from. `webhookName`
 * is the webhook's own name in Make and on the endpoint, kept from the first version: the upload finds a webhook by
 * its label, so renaming it would create a new one.
 */
export const EVENTS = [
  {
    key: 'captureSucceeded',
    event: 'capture.succeeded',
    label: 'Watch succeeded captures',
    webhookName: 'Captures Succeeded',
    description: 'Triggers when a capture finishes, from a schedule or from the Instant Snap API.',
    products: true,
    samples: ['auto-schedule.capture.succeeded', 'instant-snap.capture.succeeded'],
  },
  {
    key: 'captureFailed',
    event: 'capture.failed',
    label: 'Watch failed captures',
    webhookName: 'Captures Failed',
    description: 'Triggers when a capture fails, from a schedule or from the Instant Snap API.',
    products: true,
    samples: ['auto-schedule.capture.failed', 'instant-snap.capture.failed'],
  },
  {
    key: 'pageChanged',
    event: 'capture.changed',
    label: 'Watch page changes',
    webhookName: 'Page Changes',
    description: 'Triggers when a scheduled page looks different from its previous capture, with the change percentage.',
    samples: ['auto-schedule.capture.changed'],
  },
  {
    key: 'deliveryCompleted',
    event: 'delivery.completed',
    label: 'Watch completed deliveries',
    webhookName: 'Deliveries Completed',
    description: 'Triggers when a capture has been delivered to your cloud storage (S3, Google Drive or Dropbox).',
    samples: ['auto-schedule.delivery.completed'],
  },
  {
    key: 'schedulePaused',
    event: 'schedule.paused',
    label: 'Watch paused schedules',
    webhookName: 'Schedules Paused',
    description: 'Triggers when a schedule is paused, for example because the plan has no captures left.',
    samples: ['auto-schedule.schedule.paused'],
  },
  {
    key: 'sitemapRunCompleted',
    event: 'sitemap_run.completed',
    label: 'Watch completed sitemap runs',
    webhookName: 'Sitemap Runs Completed',
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

// Events first, as Make's naming conventions ask.
export const GROUPS = [
  { label: 'Events', modules: EVENTS.map((event) => `watch${event.key[0].toUpperCase()}${event.key.slice(1)}`) },
  { label: 'Captures', modules: ['takeScreenshot', 'createPdf', 'recordVideo', 'getPageContent', 'getCapture'] },
  { label: 'Auto Schedule', modules: ['captureScheduledPageNow'] },
  { label: 'Other', modules: ['makeApiCall'] },
];

export const SANITIZE_KEY = SANITIZE;
