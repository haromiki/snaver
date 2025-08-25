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
    productName: product?.productName || "",
    productNo: product?.productNo || "",
    keyword: product?.keyword || "",
    type: product?.type || "organic",
    intervalMin: product?.intervalMin || 60,  // 기본값 1시간(60분)으로 수정
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const addProductMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (isEditing) {
        // 수정 모드: PATCH 요청으로 기존 제품 업데이트
        const response = await apiRequest("PATCH", `/products/${product.id}`, data);
        return await response.json();
      } else {
        // 추가 모드: POST 요청으로 새 제품 생성
        const response = await apiRequest("POST", "/products", data);
        return await response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/products"] });
      toast({
        title: isEditing ? "제품 수정 완료" : "제품 추가 완료",
        description: isEditing ? "제품 정보가 업데이트되었습니다." : "새 제품이 추가되었습니다.",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: isEditing ? "제품 수정 실패" : "제품 추가 실패",
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
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{isEditing ? "제품 수정" : "제품 추가"}</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Label htmlFor="productName" className="text-gray-700 dark:text-gray-300">제품명</Label>
            <Input
              id="productName"
              type="text"
              placeholder="구분하기 위한 제품명을 입력하세요"
              value={formData.productName}
              onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
              required
              data-testid="input-product-name"
              className="mt-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          <div>
            <Label htmlFor="productNo" className="text-gray-700 dark:text-gray-300">제품번호</Label>
            <Input
              id="productNo"
              type="text"
              placeholder="네이버 쇼핑 제품번호를 입력하세요"
              value={formData.productNo}
              onChange={(e) => setFormData({ ...formData, productNo: e.target.value })}
              required
              data-testid="input-product-no"
              className="mt-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          <div>
            <Label htmlFor="keyword" className="text-gray-700 dark:text-gray-300">검색 키워드</Label>
            <Input
              id="keyword"
              type="text"
              placeholder="추적할 키워드를 입력하세요"
              value={formData.keyword}
              onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
              required
              data-testid="input-keyword"
              className="mt-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          <div>
            <Label htmlFor="type" className="text-gray-700 dark:text-gray-300">유형</Label>
            <select 
              id="type"
              className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as "ad" | "organic" })}
              data-testid="select-type"
            >
              {/* <option value="ad">광고</option> */}
              <option value="organic">일반</option>
            </select>
          </div>

          <div>
            <Label htmlFor="intervalMin" className="text-gray-700 dark:text-gray-300">추적 주기</Label>
            <select 
              id="intervalMin"
              className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              value={formData.intervalMin}
              onChange={(e) => setFormData({ ...formData, intervalMin: parseInt(e.target.value) })}
              data-testid="select-interval"
            >
              <option value={60}>1시간</option>
              <option value={360}>6시간</option>
              <option value={720}>12시간</option>
              <option value={1440}>24시간</option>
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
              className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
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