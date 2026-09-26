export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-bold">MarkUS</h1>
      <p className="text-lg text-gray-600">
        美国商标申请平台 — Marketing site, magic-link portal and staff workspaces
        will live under locale-prefixed routes (P1/P2).
      </p>
      <ul className="list-disc pl-6 text-gray-700">
        <li>/portal — client magic-link access (P2)</li>
        <li>/expert — attorney workspace (P2)</li>
        <li>/crm — salesperson console (P3)</li>
        <li>/admin — Master Admin / ERP (P7)</li>
      </ul>
    </main>
  );
}
