/**
 * Tiện ích chuẩn hóa đường dẫn cho Renderer Process (Browser-safe).
 * KHÔNG import bất kỳ module Node.js nào (child_process, fs, path) ở đây.
 */

export const normalizePath = (path: string): string => {
    if (!path) return "";
    // Chuyển all \ thành /, loại bỏ gạch chéo cuối nếu có, và chuyển về chữ thường để so sánh trên Windows
    return path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
};

export const matchesProjectId = (project: { id: string; path: string }, targetId: string | null | undefined): boolean => {
    if (!targetId) return false;
    if (project.id === targetId) return true;
    
    const normProjPath = normalizePath(project.path);
    const normTargetId = normalizePath(targetId);
    
    // Kiểm tra xem đường dẫn dự án có kết thúc bằng ID này không (hỗ trợ Path-based ID)
    return normProjPath === normTargetId || normProjPath.endsWith('/' + normTargetId) || normProjPath.endsWith(':' + normTargetId);
};
