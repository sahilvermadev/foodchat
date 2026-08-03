# Legacy Modal voice worker

The files in this directory are retained only as rollback reference. They are not part of the active Cooking Voice Mode architecture and must not be deployed for production voice traffic.

Rekky now obtains a short-lived JWT from its API and connects directly to the separately maintained AWS speech-to-speech service at the server-configured `REKKY_VOICE_CONNECT_URL`. Rekky does not install, package, allocate, or deploy speech-to-speech workers.

See [the AWS migration handoff](../../rekky-aws-s2s-migration.md) for the active protocol and required environment variables.
