import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Keyword, InsertKeyword } from "@shared/schema";

interface KeywordModalProps {
  keyword?: Keyword;
  onClose: () => void;
}

function KeywordModal({ keyword, onClose }: KeywordModalProps) {
  const [formData, setFormData] = useState({
    keyword: keyword?.keyword || "",
    category: keyword?.category || "",
    description: keyword?.description || "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: InsertKeyword) => {
      const response = await apiRequest("POST", "/api/keywords", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keywords"] });
      toast({
        title: "키워드 생성 완료",
        description: "새 키워드가 추가되었습니다.",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "키워드 생성 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<InsertKeyword>) => {
      const response = await apiRequest("PATCH", `/api/keywords/${keyword!.id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keywords"] });
      toast({
        title: "키워드 수정 완료",
        description: "키워드가 업데이트되었습니다.",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "키워드 수정 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (keyword) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" data-testid="keyword-modal">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {keyword ? "키워드 수정" : "키워드 추가"}
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            data-testid="button-close-modal"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                키워드 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.keyword}
                onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="예: 주차번호판"
                required
                data-testid="input-keyword"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                카테고리
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="예: 자동차용품"
                data-testid="input-category"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                설명
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                rows={3}
                placeholder="키워드에 대한 설명을 입력하세요"
                data-testid="input-description"
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              data-testid="button-cancel"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              data-testid="button-submit"
            >
              {(createMutation.isPending || updateMutation.isPending) ? "저장 중..." : keyword ? "수정" : "추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function KeywordManager() {
  const [selectedKeyword, setSelectedKeyword] = useState<Keyword | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: keywords = [], isLoading } = useQuery({
    queryKey: ["/api/keywords"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/keywords");
      return await response.json();
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["/api/keywords/categories"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/keywords/categories");
      return await response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (keywordId: number) => {
      const response = await apiRequest("DELETE", `/api/keywords/${keywordId}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keywords"] });
      queryClient.invalidateQueries({ queryKey: ["/api/keywords/categories"] });
      toast({
        title: "키워드 삭제 완료",
        description: "키워드가 삭제되었습니다.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "키워드 삭제 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredKeywords = keywords.filter((keyword: Keyword) => {
    const matchesSearch = keyword.keyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (keyword.description && keyword.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = categoryFilter === "all" || 
                           (categoryFilter === "uncategorized" && !keyword.category) ||
                           keyword.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const handleAddKeyword = () => {
    setSelectedKeyword(null);
    setShowModal(true);
  };

  const handleEditKeyword = (keyword: Keyword) => {
    setSelectedKeyword(keyword);
    setShowModal(true);
  };

  const handleDeleteKeyword = (keyword: Keyword) => {
    if (confirm(`'${keyword.keyword}' 키워드를 삭제하시겠습니까?`)) {
      deleteMutation.mutate(keyword.id);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedKeyword(null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">키워드 관리</h1>
        <p className="text-gray-600 dark:text-gray-400">자주 사용하는 키워드를 등록하고 관리하세요</p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="키워드 검색..."
              data-testid="input-search-keywords"
            />
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              data-testid="select-category-filter"
            >
              <option value="all">모든 카테고리</option>
              <option value="uncategorized">미분류</option>
              {categories.map((category: string) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddKeyword}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
              data-testid="button-add-keyword"
            >
              <i className="fas fa-plus"></i>
              <span>키워드 추가</span>
            </button>
          </div>
        </div>
      </div>

      {/* Keywords List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        {isLoading ? (
          <div className="p-8 text-center">
            <i className="fas fa-spinner fa-spin text-2xl text-gray-400 mb-4"></i>
            <p className="text-gray-500 dark:text-gray-400">키워드를 불러오는 중...</p>
          </div>
        ) : filteredKeywords.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <i className="fas fa-tags text-4xl mb-4 text-gray-300"></i>
            <p className="text-lg font-medium mb-2">
              {searchQuery || categoryFilter !== "all" ? "검색 결과가 없습니다" : "등록된 키워드가 없습니다"}
            </p>
            <p className="mb-4">
              {searchQuery || categoryFilter !== "all" ? "다른 조건으로 검색해보세요" : "첫 번째 키워드를 추가해보세요"}
            </p>
            {!searchQuery && categoryFilter === "all" && (
              <button
                onClick={handleAddKeyword}
                className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-blue-700"
                data-testid="button-add-first-keyword"
              >
                키워드 추가하기
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    키워드
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    카테고리
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    설명
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredKeywords.map((keyword: Keyword) => (
                  <tr key={keyword.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100" data-testid={`text-keyword-${keyword.id}`}>
                        {keyword.keyword}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {keyword.category ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                          {keyword.category}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-sm">미분류</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={keyword.description || ""}>
                        {keyword.description || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEditKeyword(keyword)}
                          className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                          title="수정"
                          data-testid={`button-edit-${keyword.id}`}
                        >
                          <i className="fas fa-edit text-sm"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteKeyword(keyword)}
                          disabled={deleteMutation.isPending}
                          className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                          title="삭제"
                          data-testid={`button-delete-${keyword.id}`}
                        >
                          <i className="fas fa-trash text-sm"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Total Count */}
      {filteredKeywords.length > 0 && (
        <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          총 {filteredKeywords.length}개의 키워드
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <KeywordModal
          keyword={selectedKeyword}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}