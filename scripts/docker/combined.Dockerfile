FROM node:24-bookworm@sha256:e7add2a490bb17d97b485b8641bd88455fff7839ade0f5eba493c3508124d413 AS node_runtime
FROM mcr.microsoft.com/dotnet/sdk:10.0.101@sha256:5504edd1267dd4deab3443f960cfab219249c8bd935fbcc358f1c24aeae23fe0
COPY --from=node_runtime /usr/local /usr/local
WORKDIR /work
