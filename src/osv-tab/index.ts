import * as SDK from 'azure-devops-extension-sdk';
import { getClient } from 'azure-devops-extension-api';
import { BuildServiceIds, type IBuildPageDataService } from 'azure-devops-extension-api/Build';
import { CommonServiceIds, type IProjectPageService } from 'azure-devops-extension-api/Common';
import { AttachmentBuildClient } from './build-client';
import { loadOsvTab, type OsvTabServices } from './load';

interface HostBuild {
  id?: number;
  project?: { id?: string };
}

/** 建置結果頁籤由主機設定的 onBuildChanged 傳入目前建置；逾時則交由備援來源。 */
function configuredBuild(timeoutMs = 10000): Promise<HostBuild | undefined> {
  const config = SDK.getConfiguration() as {
    onBuildChanged?: (handler: (build: HostBuild) => void) => void;
  };
  if (typeof config?.onBuildChanged !== 'function') return Promise.resolve(undefined);

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    config.onBuildChanged!((build) => {
      clearTimeout(timer);
      resolve(build);
    });
  });
}

/** 初始化主機主題，優先以頁籤設定取得目前建置，避免解析 iframe 網址。 */
function hostServices(): OsvTabServices {
  let client: AttachmentBuildClient | undefined;
  return {
    /** 等待主機握手後取得建置；舊主機改用建置頁資料服務與專案頁服務。 */
    async initialize() {
      await SDK.init({ loaded: false, applyTheme: true });
      await SDK.ready();
      const build = (await configuredBuild()) ?? (await pageDataBuild());
      const project =
        build?.project?.id ||
        (
          await (
            await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService)
          ).getProject()
        )?.id;
      return { project: project ?? '', buildId: build?.id ?? 0 };
    },

    /** 成功或可閱讀的錯誤都已呈現後，通知主機關閉載入指示。 */
    loaded: () => SDK.notifyLoadSucceeded(),

    /** 延後建立 REST client，確保主機握手完成才請求服務位置。 */
    get client() {
      return (client ??= getClient(AttachmentBuildClient));
    },
  };
}

/** 舊版建置頁提供的建置資料；新版頁籤主機可能回傳空值。 */
async function pageDataBuild(): Promise<HostBuild | undefined> {
  const buildPage = await SDK.getService<IBuildPageDataService>(
    BuildServiceIds.BuildPageDataService,
  );
  return buildPage.getBuildPageData()?.build;
}

const root = document.getElementById('osv-report');
if (root) {
  void loadOsvTab(root, hostServices()).catch(() => {
    root.textContent = '無法完成頁籤主機連線，請重新開啟建置結果頁。';
    root.setAttribute('role', 'alert');
  });
}
