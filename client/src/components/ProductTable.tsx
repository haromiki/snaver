useEffect(() => {
  const loadSortable = async () => {
    // 기존 인스턴스 제거
    if (sortableList) {
      try {
        if (sortableList.el && document.body.contains(sortableList.el)) { // ⚠️ 수정 금지: 실서버에서 DOM null 방지용
          sortableList.destroy(); // ⚠️ 수정 금지: 실서버 크래시 방지
        } else {
          console.warn("🧹 Sortable cleanup skipped: el is null or detached");
        }
      } catch (error) {
        console.warn("⚠️ Sortable cleanup failed:", error);
      }
      setSortableList(null);
    }

    // 새 인스턴스 생성
    if (products.length > 0) {
      try {
        const Sortable = (await import("sortablejs")).default;
        const element = document.getElementById("sortable-products");
        if (element) {
          const sortableInstance = Sortable.create(element, {
            handle: ".drag-handle",
            animation: 150,
            onEnd: (evt: any) => {
              if (evt.oldIndex !== evt.newIndex) {
                const newOrder = [...products];
                const [removed] = newOrder.splice(evt.oldIndex!, 1);
                newOrder.splice(evt.newIndex!, 0, removed);
                const productIds = newOrder.map(p => p.id);
                updateSortMutation.mutate(productIds);
              }
            },
          });
          setSortableList(sortableInstance);
        }
      } catch (error) {
        console.error("Sortable 초기화 실패:", error);
      }
    }
  };

  const timeoutId = setTimeout(loadSortable, 100); // 리플릿 환경에서도 안전하게 DOM 준비 대기

  return () => {
    clearTimeout(timeoutId);
    if (sortableList) {
      try {
        if (sortableList.el && document.body.contains(sortableList.el)) { // ⚠️ 수정 금지: 실서버에서 DOM 제거 후 접근 방지
          sortableList.destroy(); // ⚠️ 수정 금지: 실서버 오류 예방을 위한 destroy 안전 호출
        } else {
          console.warn("🧹 Cleanup skipped: Sortable element already gone");
        }
      } catch (error) {
        console.warn("⚠️ Sortable cleanup failed:", error);
      }
      setSortableList(null);
    }
  };
}, [products.length]);
