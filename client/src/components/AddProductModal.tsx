import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface AddProductModalProps {
  onClose: () => void;
  product?: any;
}

export default function AddProductModal({ onClose, product }: AddProductModalProps) {
  const isEditing = !!product;
  const [formData, setFormData] = useState({
    productNo: product?.productNo || "",
    keyword: product?.keyword || "",
    type: product?.type || "ad",
    intervalMin: product?.intervalMin || 15,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const addProductMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/products", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/products"] });
      toast({
        title: "제품 추가 완료",
        description: "새 제품이 추가되었습니다.",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "제품 추가 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addProductMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" data-testid="add-product-modal">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{isEditing ? "제품 수정" : "제품 추가"}</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Label htmlFor="productNo">제품번호</Label>
            <Input
              id="productNo"
              type="text"
              placeholder="네이버 쇼핑 제품번호를 입력하세요"
              value={formData.productNo}
              onChange={(e) => setFormData({ ...formData, productNo: e.target.value })}
              required
              data-testid="input-product-no"
            />
          </div>

          <div>
            <Label htmlFor="keyword">검색 키워드</Label>
            <Input
              id="keyword"
              type="text"
              placeholder="추적할 키워드를 입력하세요"
              value={formData.keyword}
              onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
              required
              data-testid="input-keyword"
            />
          </div>

          <div>
            <Label htmlFor="type">유형</Label>
            <select 
              id="type"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as "ad" | "organic" })}
              data-testid="select-type"
            >
              <option value="ad">광고</option>
              <option value="organic">일반</option>
            </select>
          </div>

          <div>
            <Label htmlFor="intervalMin">추적 주기</Label>
            <select 
              id="intervalMin"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              value={formData.intervalMin}
              onChange={(e) => setFormData({ ...formData, intervalMin: parseInt(e.target.value) })}
              data-testid="select-interval"
            >
              <option value={5}>5분</option>
              <option value={10}>10분</option>
              <option value={15}>15분</option>
              <option value={30}>30분</option>
              <option value={60}>60분</option>
            </select>
          </div>

          <div className="flex items-center space-x-3 pt-4">
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={addProductMutation.isPending}
              data-testid="button-submit-product"
            >
              {isEditing ? (addProductMutation.isPending ? "수정 중..." : "수정") : (addProductMutation.isPending ? "추가 중..." : "추가")}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              data-testid="button-cancel-add"
            >
              취소
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}