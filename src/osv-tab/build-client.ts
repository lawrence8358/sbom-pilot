import { BuildRestClient } from 'azure-devops-extension-api/Build';
import type { RestClientRequestParams } from 'azure-devops-extension-api/Common/RestClientBase';

/** 保留官方 Build client 的路由與授權，只降低附件 API 版本以支援 Server 2022.2。 */
export class AttachmentBuildClient extends BuildRestClient {
  /** 新版套件預設 7.2；附件沿用 7.0 契約，不要求主機提供較新的 API。 */
  protected override beginRequest<T>(params: RestClientRequestParams): Promise<T> {
    return super.beginRequest<T>({
      ...params,
      apiVersion: params.routeTemplate.includes('/attachments/')
        ? '7.0-preview.2'
        : params.apiVersion,
    });
  }
}
