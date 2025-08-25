import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "./ThemeProvider";
import ChangePasswordModal from "./ChangePasswordModal";

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export default function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

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
    <div className="w-60 bg-gray-50 dark:bg-gray-900 shadow-lg border-r border-gray-200 dark:border-gray-700 flex flex-col" style={{width: '240px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700" style={{padding: '24px'}}>
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <i className="fas fa-chart-line text-white text-sm"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">SNAVER</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">순위 추적 시스템</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navItems.map((category) => (
          <div key={category.category} className="space-y-1">
            <h3 className="px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {category.category}
            </h3>
            {category.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`w-full text-left group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeSection === item.id
                    ? "bg-primary text-white"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
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
          <h3 className="px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">계정</h3>
          <button
            onClick={() => setShowChangePasswordModal(true)}
            className="w-full text-left group flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            data-testid="button-change-password"
          >
            <i className="fas fa-key mr-3 text-sm"></i>
            비밀번호 변경
          </button>
          <button
            onClick={logout}
            className="w-full text-left group flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            data-testid="button-logout"
          >
            <i className="fas fa-sign-out-alt mr-3 text-sm"></i>
            로그아웃
          </button>
        </div>
      </nav>

      {/* 다크모드 토글 */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">다크 모드</span>
          <button
            onClick={toggleTheme}
            className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 dark:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            data-testid="button-theme-toggle"
          >
            <span className="sr-only">다크 모드 토글</span>
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
              }`}
            >
              {theme === 'dark' ? (
                <i className="fas fa-moon text-xs text-gray-600 flex items-center justify-center h-full"></i>
              ) : (
                <i className="fas fa-sun text-xs text-yellow-500 flex items-center justify-center h-full"></i>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
            <i className="fas fa-user text-gray-600 dark:text-gray-300 text-sm"></i>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100" data-testid="text-username">
              {(user as any)?.username}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="text-email">
              {(user as any)?.email}
            </p>
          </div>
        </div>
      </div>

      {/* 비밀번호 변경 모달 */}
      {showChangePasswordModal && (
        <ChangePasswordModal onClose={() => setShowChangePasswordModal(false)} />
      )}
    </div>
  );
}
