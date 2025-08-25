import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface DeleteAccountModalProps {
  onClose: () => void;
}

export default function DeleteAccountModal({ onClose }: DeleteAccountModalProps) {
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const { logout } = useAuth();
  const { toast } = useToast();

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/auth/delete-account", {
        password,
        confirmText
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "회원탈퇴 완료",
        description: "계정이 성공적으로 삭제되었습니다.",
      });
      logout(); // 자동 로그아웃
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "회원탈퇴 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      toast({
        title: "비밀번호 입력 필요",
        description: "현재 비밀번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    
    if (confirmText !== "회원탈퇴") {
      toast({
        title: "확인 텍스트 불일치",
        description: "'회원탈퇴'를 정확히 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    deleteAccountMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-red-600 dark:text-red-400">
            <i className="fas fa-exclamation-triangle mr-2"></i>
            회원탈퇴
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            data-testid="button-close-delete-account"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="mb-6">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-bold text-red-800 dark:text-red-300 mb-2">
              <i className="fas fa-exclamation-circle mr-1"></i>
              주의사항
            </h3>
            <ul className="text-sm text-red-700 dark:text-red-400 space-y-1">
              <li>• 계정 삭제 시 모든 데이터가 영구적으로 삭제됩니다</li>
              <li>• 등록된 모든 제품과 순위 데이터가 삭제됩니다</li>
              <li>• 삭제된 데이터는 복구할 수 없습니다</li>
              <li>• 동일한 아이디로 재가입이 가능합니다</li>
            </ul>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              현재 비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
              placeholder="현재 비밀번호를 입력하세요"
              data-testid="input-current-password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              확인 텍스트
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
              placeholder="'회원탈퇴'를 입력하세요"
              data-testid="input-confirm-text"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              계정 삭제를 확인하려면 '회원탈퇴'를 정확히 입력해주세요.
            </p>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              data-testid="button-cancel-delete"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={deleteAccountMutation.isPending}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="button-confirm-delete"
            >
              {deleteAccountMutation.isPending ? (
                <>
                  <i className="fas fa-spinner animate-spin mr-2"></i>
                  삭제 중...
                </>
              ) : (
                <>
                  <i className="fas fa-trash mr-2"></i>
                  계정 삭제
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}