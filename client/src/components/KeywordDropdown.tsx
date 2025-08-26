import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Keyword } from "@shared/schema";

interface KeywordDropdownProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'data-testid'?: string;
}

export default function KeywordDropdown({ 
  value, 
  onChange, 
  placeholder = "키워드 선택 또는 입력", 
  className = "",
  'data-testid': testId
}: KeywordDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: keywords = [] } = useQuery({
    queryKey: ["/keywords"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/keywords");
      return await response.json();
    },
  });

  // 입력값과 매칭되는 키워드 필터링
  const filteredKeywords = keywords.filter((keyword: Keyword) =>
    keyword.keyword.toLowerCase().includes(inputValue.toLowerCase())
  );

  // 카테고리별로 그룹화
  const keywordsByCategory = filteredKeywords.reduce((acc: Record<string, Keyword[]>, keyword: Keyword) => {
    const category = keyword.category || "미분류";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(keyword);
    return acc;
  }, {});

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setIsOpen(true);
  };

  const handleKeywordSelect = (keyword: string) => {
    setInputValue(keyword);
    onChange(keyword);
    setIsOpen(false);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${className}`}
        data-testid={testId}
      />
      
      {isOpen && filteredKeywords.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-y-auto z-50"
          data-testid="keyword-dropdown-options"
        >
          {Object.entries(keywordsByCategory).map(([category, categoryKeywords]) => (
            <div key={category}>
              <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                {category}
              </div>
              {categoryKeywords.map((keyword: Keyword) => (
                <button
                  key={keyword.id}
                  onClick={() => handleKeywordSelect(keyword.keyword)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700"
                  data-testid={`keyword-option-${keyword.id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{keyword.keyword}</span>
                    {keyword.description && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate ml-2 max-w-32">
                        {keyword.description}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))}
          
          {/* 입력값이 기존 키워드와 정확히 일치하지 않을 때 새 키워드로 추가 옵션 표시 */}
          {inputValue && !keywords.some((k: Keyword) => k.keyword.toLowerCase() === inputValue.toLowerCase()) && (
            <div className="border-t border-gray-200 dark:border-gray-600">
              <button
                onClick={() => handleKeywordSelect(inputValue)}
                className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-blue-50 dark:hover:bg-blue-900/20 focus:outline-none focus:bg-blue-50 dark:focus:bg-blue-900/20"
                data-testid="keyword-option-new"
              >
                <div className="flex items-center">
                  <i className="fas fa-plus mr-2 text-xs"></i>
                  <span>"{inputValue}" 키워드 사용</span>
                </div>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}