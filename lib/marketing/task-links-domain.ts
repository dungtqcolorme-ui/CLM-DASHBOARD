import { inputId, inputKeys, inputNumber, inputObject, inputText, inputVersion } from "@/lib/marketing/input";
import { MarketingError } from "@/lib/marketing/domain";

export type TaskSummary = { id: string; title: string; status: string; owner_id: string; deadline: string; version: number };
export type MarketingTaskLink = {
  id: string; team_id: string; campaign_id: string; content_id: string; task_id: string;
  enabled: boolean; creator_id: string; version: number; created_at: string; updated_at: string;
};
export type TaskLinkWorkspace = { links: Array<MarketingTaskLink & { task: TaskSummary | null }> };
export type TaskLookup = { task: TaskSummary; expected_link_version: number };
export type TaskLinkCommand =
  | { action: "link_task"; content_id: string; task_id: string; expected_link_version: number }
  | { action: "unlink_task"; id: string; expected_version: number; reason: string };

export function taskId(value: unknown): string {
  const id = inputText(value, 120, true);
  if (!/^[A-Za-z0-9:_-]+$/.test(id)) throw new MarketingError("Mã Task không hợp lệ.");
  return id;
}
export function parseTaskLinkCommand(value: unknown): TaskLinkCommand {
  const command = inputObject(value);
  if (command.action === "link_task") {
    inputKeys(command, ["action", "content_id", "task_id", "expected_link_version"]);
    return { action: "link_task", content_id: inputId(command.content_id), task_id: taskId(command.task_id),
      expected_link_version: inputNumber(command.expected_link_version, 0, 2147483646, true) };
  }
  if (command.action === "unlink_task") {
    inputKeys(command, ["action", "id", "expected_version", "reason"]);
    return { action: "unlink_task", id: inputId(command.id), expected_version: inputVersion(command.expected_version), reason: inputText(command.reason, 2000, true) };
  }
  throw new MarketingError("Thao tác liên kết Task không hợp lệ.");
}
export function parseTaskQuery(params: URLSearchParams) {
  if ([...params.keys()].some((key) => !["content_id", "task_id"].includes(key)) || params.getAll("content_id").length !== 1 || params.getAll("task_id").length > 1) {
    throw new MarketingError("Chỉ chấp nhận nội dung và mã Task.");
  }
  return { contentId: inputId(params.get("content_id")), taskId: params.has("task_id") ? taskId(params.get("task_id")) : null };
}
