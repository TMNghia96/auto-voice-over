"use strict";
/**
 * Tiện ích chuẩn hóa đường dẫn cho Renderer Process (Browser-safe).
 * KHÔNG import bất kỳ module Node.js nào (child_process, fs, path) ở đây.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchesProjectId = exports.normalizePath = void 0;
const normalizePath = (path) => {
    if (!path)
        return "";
    // Chuyển all \ thành /, loại bỏ gạch chéo cuối nếu có, và chuyển về chữ thường để so sánh trên Windows
    return path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
};
exports.normalizePath = normalizePath;
const matchesProjectId = (project, targetId) => {
    if (!targetId)
        return false;
    if (project.id === targetId)
        return true;
    const normProjPath = (0, exports.normalizePath)(project.path);
    const normTargetId = (0, exports.normalizePath)(targetId);
    // Kiểm tra xem đường dẫn dự án có kết thúc bằng ID này không (hỗ trợ Path-based ID)
    return normProjPath === normTargetId || normProjPath.endsWith('/' + normTargetId) || normProjPath.endsWith(':' + normTargetId);
};
exports.matchesProjectId = matchesProjectId;
//# sourceMappingURL=BrowserPathUtils.js.map