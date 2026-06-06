import { Link, useLocation } from "react-router-dom";

export function TopAppBar() {
  const location = useLocation();

  const links = [
    { label: "Maritime Credentials", href: "/onboarding/credentials" },
    { label: "Onboarding Fee", href: "/onboarding/fee" },
    { label: "Vendor Registration", href: "/onboarding/registration" },
    { label: "KYC & Compliance", href: "/onboarding/kyc" },
    { label: "Final Review", href: "/onboarding/review" },
  ];

  return (
    <header className="fixed top-0 z-50 w-full h-16 flex justify-between items-center px-gutter border-b border-border-low bg-surface-container/80 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-headline-sm font-bold text-primary">Axeon Maritime</Link>
      </div>
      
      <nav className="hidden md:flex gap-8 h-full items-center">
        {links.map((link) => {
          const isActive = location.pathname.includes(link.href);
          return (
            <Link
              key={link.href}
              to={link.href}
              className={`font-label-caps h-full flex items-center px-1 transition-all duration-300 ${
                isActive
                  ? "text-primary border-b-2 border-primary font-bold"
                  : "text-on-surface-variant opacity-60 hover:text-primary"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-4">
        <button className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors">
          help
        </button>
        <button className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors">
          account_circle
        </button>
      </div>
    </header>
  );
}
