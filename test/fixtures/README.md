# Local TLS test fixture

`localhost.key.pem` is a public, deliberately committed test-only private key for the self-signed `localhost.cert.pem`. It is not a production credential. Never use this fixture for deployed services. Tests bind only to loopback and verify that TLS validation rejects the certificate unless DT's per-request skip option is enabled.
