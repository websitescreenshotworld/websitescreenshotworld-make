# Make editor schemas

The JSON schemas Make's app editor validates component code with, and the script that applies them to `app/`
(`npm run validate`). Copied unchanged from Make's custom-apps skill
(https://github.com/integromat/make-apps-skill, `skills/make-custom-apps/references/editor-schemas/`), which took
them from https://github.com/integromat/vscode-apps-sdk at commit `6ff5f3dd9960ccbeb24de3beb1cca935de89eaa0`.
License: LICENSE.md in this folder.

A warning is something to read, not proof of a defect. The webhook receiver `api` has no editor schema and is
reported as not validated.
