# Navigation map

Existing entries stay in their original order and labels. Original role visibility is preserved.

```text
Báo cáo
  Đối ngoại               /?legacy=doingoai
  Truyền thông            /?legacy=truyenthong
  Ấn phẩm                 /?legacy=anpham
  Học bổng                /?legacy=hocbong
  Hiệu suất               /?legacy=baocao
Quản lý công việc
  Task hàng ngày          /?legacy=phoihop       (not Viewer)
  Tài liệu                /?legacy=tailieu
Marketing                 disclosure, no navigation on toggle
  Marketing Overview      /marketing
  Campaigns               /marketing/campaigns
  AI Agent & Ideas        /marketing/agent
  Creative Studio         /marketing/studio
  Content Calendar        /marketing/calendar
  Asset & Template Library /marketing/assets
  Intelligence & Reports /marketing/intelligence
  Approval Inbox          /marketing/approvals
Hệ thống
  Quản lý tài khoản       /?legacy=taikhoan      (Leader/Admin)
```

Campaign detail: `/marketing/campaigns/{id}?tab=overview|strategy|content-plan|calendar|assets|insights`. Studio: `/marketing/studio?content={id}`. Shared Campaign selection uses a safe `campaign` query parameter. These nested screens do not add sidebar entries.

The legacy document contains one Marketing disclosure, rendered by the local `public/marketing/legacy-navigation.js`. Toggling modifies only its state/ARIA/inert panel; collapsed-sidebar activation expands before showing links. Its same-origin bridge accepts only Marketing paths. The root layout retains the legacy iframe during Next client navigation. Child Marketing routes share a persistent layout; direct refresh/deep link opens the submenu and identifies the active child. Login returns only to a validated local Marketing destination.
