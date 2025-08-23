import { useAuth } from "@/hooks/useAuth";

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export default function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const { user, logout } = useAuth();

  const navItems = [
    {
      category: "순위 추적",
      items: [
        // { id: "ad-tracking", label: "광고 순위 추적", icon: "fas fa-bullhorn" },
        { id: "organic-tracking", label: "일반 순위 추적", icon: "fas fa-search" },
      ]
    },
    {
      category: "제품 관리",
      items: [
        // { id: "ad-management", label: "광고 제품 관리", icon: "fas fa-ad" },
        { id: "organic-management", label: "일반 제품 관리", icon: "fas fa-cogs" },
      ]
    }
  ];

  return (
    <div className="w-60 bg-surface shadow-lg border-r border-gray-200 flex flex-col" style={{width: '240px', background: '#f8f9fa', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200" style={{padding: '24px', borderBottom: '1px solid #e5e7eb'}}>
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <i className="fas fa-chart-line text-white text-sm"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">SNAVER</h1>
            <p className="text-xs text-gray-500">순위 추적 시스템</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navItems.map((category) => (
          <div key={category.category} className="space-y-1">
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {category.category}
            </h3>
            {category.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`w-full text-left group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeSection === item.id
                    ? "bg-primary text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
                data-testid={`nav-${item.id}`}
              >
                <i className={`${item.icon} mr-3 text-sm`}></i>
                {item.label}
              </button>
            ))}
          </div>
        ))}

        <div className="space-y-1 pt-4">
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">계정</h3>
          <button
            onClick={logout}
            className="w-full text-left group flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-100"
            data-testid="button-logout"
          >
            <i className="fas fa-sign-out-alt mr-3 text-sm"></i>
            로그아웃
          </button>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
            <i className="fas fa-user text-gray-600 text-sm"></i>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900" data-testid="text-username">
              {(user as any)?.username}
            </p>
            <p className="text-xs text-gray-500" data-testid="text-email">
              {(user as any)?.email}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
