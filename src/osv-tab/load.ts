import type { Attachment, BuildRestClient } from 'azure-devops-extension-api/Build';
import { OSV_TAB_ATTACHMENT_TYPE } from '../shared/osv-tab-contract';
import { renderOsvReport } from './render';

export interface OsvTabServices {
  initialize(): Promise<{ project: string; buildId: number }>;
  loaded(): Promise<void>;
  client: Pick<BuildRestClient, 'getAttachments' | 'getAttachment'>;
}

/** 用固定訊息取代可能含敏感內容的伺服器錯誤，並提供下一步。 */
function showError(root: HTMLElement, message: string): void {
  const alert = root.ownerDocument.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.textContent = message;
  root.replaceChildren(alert);
}

/** 只取附件連結中的紀錄識別，不直接向外部提供的網址送出授權請求。 */
function attachmentRecord(attachment: Attachment, buildId: number): [string, string] {
  const href = attachment._links?.self?.href;
  const path = typeof href === 'string' ? new URL(href).pathname : '';
  const match =
    /\/_apis\/build\/builds\/(\d+)\/([^/]+)\/([^/]+)\/attachments\/([^/]+)\/([^/]+)$/i.exec(path);
  if (
    !match ||
    Number(match[1]) !== buildId ||
    decodeURIComponent(match[4]) !== OSV_TAB_ATTACHMENT_TYPE ||
    decodeURIComponent(match[5]) !== attachment.name
  ) {
    throw new Error('附件連結格式不正確。');
  }
  return [decodeURIComponent(match[2]), decodeURIComponent(match[3])];
}

/** 從主機的目前建置載入附件並呈現報告。 */
export async function loadOsvTab(root: HTMLElement, services: OsvTabServices): Promise<void> {
  root.textContent = '正在載入 OSV 弱點報告…';
  try {
    const { project, buildId } = await services.initialize();
    if (!project || !Number.isSafeInteger(buildId) || buildId <= 0) {
      showError(root, '無法取得目前建置資訊，請重新開啟建置結果頁。');
      return;
    }
    const attachments = await services.client.getAttachments(
      project,
      buildId,
      OSV_TAB_ATTACHMENT_TYPE,
    );
    if (!attachments.length) {
      showError(
        root,
        '找不到 OSV 弱點報告附件。請確認 SBOM Pilot 已完成附件上傳，再重新整理頁籤。',
      );
      return;
    }
    root.replaceChildren();
    for (const attachment of attachments) {
      const article = root.ownerDocument.createElement('article');
      article.setAttribute('aria-label', attachment.name);
      root.append(article);
      try {
        const [timeline, record] = attachmentRecord(attachment, buildId);
        const bytes = await services.client.getAttachment(
          project,
          buildId,
          timeline,
          record,
          OSV_TAB_ATTACHMENT_TYPE,
          attachment.name,
        );
        renderOsvReport(
          article,
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
        );
      } catch {
        showError(
          article,
          '無法讀取 OSV 弱點報告附件。請確認建置讀取權限與附件 JSON 格式，再重新整理頁籤。',
        );
      }
    }
  } catch {
    showError(
      root,
      '無法載入 OSV 弱點報告。請確認建置讀取權限、擴充套件授權與網路連線，再重新整理頁籤。',
    );
  } finally {
    await services.loaded();
  }
}
