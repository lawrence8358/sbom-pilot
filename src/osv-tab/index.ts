import * as SDK from 'azure-devops-extension-sdk';
import { getClient } from 'azure-devops-extension-api';
import { BuildServiceIds, type IBuildPageDataService } from 'azure-devops-extension-api/Build';
import { CommonServiceIds, type IProjectPageService } from 'azure-devops-extension-api/Common';
import { AttachmentBuildClient } from './build-client';
import { loadOsvTab, type OsvTabServices } from './load';

/** 初始化主機主題並從建置頁服務取得目前專案與建置，避免解析 iframe 網址。 */
function hostServices(): OsvTabServices {
  let client: AttachmentBuildClient | undefined;
  return {
    /** 等待主機握手後再索取頁面資訊與授權服務。 */
    async initialize() {
      await SDK.init({ loaded: false, applyTheme: true });
      const buildPage = await SDK.getService<IBuildPageDataService>(
        BuildServiceIds.BuildPageDataService,
      );
      const projectPage = await SDK.getService<IProjectPageService>(
        CommonServiceIds.ProjectPageService,
      );
      const project = await projectPage.getProject();
      return { project: project?.id ?? '', buildId: buildPage.getBuildPageData()?.build?.id ?? 0 };
    },

    /** 成功或可閱讀的錯誤都已呈現後，通知主機關閉載入指示。 */
    loaded: () => SDK.notifyLoadSucceeded(),

    /** 延後建立 REST client，確保主機握手完成才請求服務位置。 */
    get client() {
      return (client ??= getClient(AttachmentBuildClient));
    },
  };
}

const root = document.getElementById('osv-report');
if (root) {
  void loadOsvTab(root, hostServices()).catch(() => {
    root.textContent = '無法完成頁籤主機連線，請重新開啟建置結果頁。';
    root.setAttribute('role', 'alert');
  });
}
