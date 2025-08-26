import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const url = keyword ? `/keywords/${keyword.id}` : "/keywords";
      const method = keyword ? "PATCH" : "POST";
      const response = await apiRequest(method, url, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/keywords"] });
      toast({
        title: keyword ? "키워드 수정 완료" : "키워드 추가 완료",
        description: `"${formData.keyword}" 키워드가 ${keyword ? "수정" : "추가"}되었습니다.`,
      });
      onSuccess();
      onOpenChange(false);
      setFormData({ keyword: "" });
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
  const [searchQuery, setSearchQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState<Keyword | undefined>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: keywords = [], isLoading } = useQuery({
    queryKey: ["/keywords"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/keywords");
      return await response.json();
    },
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: async (keywordId: number) => {
      await apiRequest("DELETE", `/keywords/${keywordId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/keywords"] });
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
    const matchesSearch = keyword.keyword.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
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
              </div>
              <Button 
                onClick={() => setAddModalOpen(true)}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                키워드 추가
              </Button>
            </div>

            {/* 검색 */}
            <div className="flex gap-4">
              <div className="flex-1 ml-1 mr-1">
                <Input
                  placeholder="키워드 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
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
                    {searchQuery 
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
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium leading-[30px]">{keyword.keyword}</h3>
                            </div>
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