const services = [
  { name: "Next.js", detail: "App Router · TypeScript · Tailwind CSS" },
  { name: "Supabase", detail: "Database client and health check ready" },
  { name: "Vercel", detail: "Production deployment target" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-10 text-[#18211c] sm:px-10 lg:px-16">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-between overflow-hidden rounded-[2rem] border border-black/10 bg-[#fffdf8] p-8 shadow-[0_24px_80px_rgba(24,33,28,0.08)] sm:p-12">
        <div>
          <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-6">
            <span className="text-sm font-semibold tracking-[0.24em]">COLORME</span>
            <span className="rounded-full bg-[#dff6e7] px-4 py-2 text-xs font-semibold text-[#17633a]">
              SYSTEM READY
            </span>
          </div>

          <div className="grid gap-10 py-16 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div>
              <p className="mb-5 text-sm font-medium uppercase tracking-[0.2em] text-[#68736c]">
                Project foundation
              </p>
              <h1 className="max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-7xl">
                CLM DASHBOARD
              </h1>
            </div>
            <p className="max-w-md text-lg leading-8 text-[#68736c]">
              Hạ tầng dashboard hiện đại, sẵn sàng kết nối dữ liệu và triển khai
              liên tục từ GitHub lên Vercel.
            </p>
          </div>
        </div>

        <div className="grid gap-3 border-t border-black/10 pt-6 md:grid-cols-3">
          {services.map((service, index) => (
            <article
              key={service.name}
              className="rounded-2xl border border-black/10 bg-white p-5"
            >
              <p className="mb-8 text-xs font-semibold text-[#8a938d]">
                0{index + 1}
              </p>
              <h2 className="text-lg font-semibold">{service.name}</h2>
              <p className="mt-2 text-sm leading-6 text-[#68736c]">
                {service.detail}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
