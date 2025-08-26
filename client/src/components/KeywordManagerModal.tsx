import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, Tag } from "lucide-react";

interface KeywordManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Keyword {
  id: number;
  keyword: string;
  category: string;
  description?: string;
}

interface AddKeywordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyword?: Keyword;
  onSuccess: () => void;
}

function AddKeywordModal({ open, onOpenChange, keyword, onSuccess }: AddKeywordModalProps) {
  const [formData, setFormData] = useState({
    keyword: keyword?.keyword || "",
    category: keyword?.category || "",
    description: keyword?.description || "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const url = keyword ? `/api/keywords/${keyword.id}` : "/api/keywords";
      const method = keyword ? "PATCH" : "POST";
      const response = await apiRequest(method, url, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keywords"] });
      queryClient.invalidateQueries({ queryKey: ["/api/keywords/categories"] });
      toast({
        title: keyword ? "키워드 수정 완료" : "키워드 추가 완료",
        description: `"${formData.keyword}" 키워드가 ${keyword ? "수정" : "추가"}되었습니다.`,
      });
      onSuccess();
      onOpenChange(false);
      setFormData({ keyword: "", category: "", description: "" });
    },
    onError: (error: any) => {
      toast({
        title: keyword ? "키워드 수정 실패" : "키워드 추가 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.keyword.trim()) {
      toast({
        title: "입력 오류",
        description: "키워드를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {keyword ? "키워드 수정" : "키워드 추가"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="keyword" className="text-sm font-medium">
              키워드 *
            </label>
            <Input
              id="keyword"
              value={formData.keyword}
              onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
              placeholder="검색할 키워드를 입력하세요"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="category" className="text-sm font-medium">
              카테고리
            </label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="키워드 분류 (예: 전자제품, 의류, 도서)"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              설명
            </label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="키워드에 대한 추가 설명 (선택사항)"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "처리중..." : keyword ? "수정" : "추가"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function KeywordManagerModal({ open, onOpenChange }: KeywordManagerModalProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState<Keyword | undefined>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: keywords = [], isLoading } = useQuery({
    queryKey: ["/api/keywords"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/keywords");
      return await response.json();
    },
    enabled: open,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["/api/keywords/categories"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/keywords/categories");
      return await response.json();
    },
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: async (keywordId: number) => {
      await apiRequest("DELETE", `/api/keywords/${keywordId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keywords"] });
      queryClient.invalidateQueries({ queryKey: ["/api/keywords/categories"] });
      toast({
        title: "키워드 삭제 완료",
        description: "키워드가 성공적으로 삭제되었습니다.",
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

  // 필터링된 키워드
  const filteredKeywords = keywords.filter((keyword: Keyword) => {
    const matchesCategory = selectedCategory === "all" || keyword.category === selectedCategory;
    const matchesSearch = keyword.keyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         keyword.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // 카테고리별 통계
  const categoryStats = keywords.reduce((acc: Record<string, number>, keyword: Keyword) => {
    const category = keyword.category || "미분류";
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const handleEdit = (keyword: Keyword) => {
    setEditingKeyword(keyword);
    setAddModalOpen(true);
  };

  const handleAddSuccess = () => {
    setEditingKeyword(undefined);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              키워드 관리
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col space-y-4">
            {/* 통계 및 액션 버튼 */}
            <div className="flex justify-between items-center">
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>전체 키워드: {keywords.length}개</span>
                <span>카테고리: {categories.length}개</span>
              </div>
              <Button 
                onClick={() => setAddModalOpen(true)}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                키워드 추가
              </Button>
            </div>

            {/* 필터 및 검색 */}
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  placeholder="키워드 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 카테고리</SelectItem>
                  {categories.map((category: string) => (
                    <SelectItem key={category} value={category}>
                      {category} ({categoryStats[category] || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 키워드 목록 */}
            <div className="flex-1 overflow-auto">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  키워드 목록을 불러오는 중...
                </div>
              ) : filteredKeywords.length === 0 ? (
                <div className="text-center py-8">
                  <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-2">
                    {searchQuery || selectedCategory !== "all" 
                      ? "검색 결과가 없습니다" 
                      : "등록된 키워드가 없습니다"
                    }
                  </p>
                  <Button onClick={() => setAddModalOpen(true)} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    첫 번째 키워드 추가하기
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredKeywords.map((keyword: Keyword) => (
                    <Card key={keyword.id} className="transition-all hover:shadow-md">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-medium">{keyword.keyword}</h3>
                              {keyword.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {keyword.category}
                                </Badge>
                              )}
                            </div>
                            {keyword.description && (
                              <p className="text-sm text-muted-foreground">
                                {keyword.description}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1 ml-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(keyword)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteMutation.mutate(keyword.id)}
                              disabled={deleteMutation.isPending}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AddKeywordModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        keyword={editingKeyword}
        onSuccess={handleAddSuccess}
      />
    </>
  );
}