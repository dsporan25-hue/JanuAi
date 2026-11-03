package com.poran.piyaai;

import android.accessibilityservice.AccessibilityService;
import android.os.Bundle;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.List;

/** অন্য অ্যাপের ভিতরে ক্লিক, টাইপ ও সার্চ করার সার্ভিস। */
public class JanuAccessibilityService extends AccessibilityService {
    private static JanuAccessibilityService instance;

    public static JanuAccessibilityService get() { return instance; }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            String pkg = event.getPackageName().toString();
            if (!pkg.equals(getPackageName()) && !pkg.equals("com.android.systemui")) {
                JanuCommandMemory.setCurrentApp(this, pkg);
            }
        }
    }

    @Override
    public void onInterrupt() {}

    /** টেক্সট বা content-description মিললে সেই বাটনে ক্লিক করে */
    public boolean clickByText(String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || text == null || text.isEmpty()) return false;
        List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(text);
        if (nodes != null) {
            for (AccessibilityNodeInfo n : nodes) {
                if (clickNodeOrParent(n)) return true;
            }
        }
        return clickByDescription(root, text.toLowerCase());
    }

    private boolean clickByDescription(AccessibilityNodeInfo node, String lower) {
        if (node == null) return false;
        CharSequence d = node.getContentDescription();
        if (d != null && d.toString().toLowerCase().contains(lower)) {
            if (clickNodeOrParent(node)) return true;
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            if (clickByDescription(node.getChild(i), lower)) return true;
        }
        return false;
    }

    private boolean clickNodeOrParent(AccessibilityNodeInfo n) {
        AccessibilityNodeInfo cur = n;
        for (int i = 0; i < 6 && cur != null; i++) {
            if (cur.isClickable() && cur.isEnabled()) {
                return cur.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            }
            cur = cur.getParent();
        }
        return false;
    }

    /** ফোকাস করা বা প্রথম লেখার বক্সে টেক্সট বসায় */
    public boolean typeText(String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo target = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (target == null || !target.isEditable()) target = findEditable(root);
        if (target == null) return false;
        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        return target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
    }

    private AccessibilityNodeInfo findEditable(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isEditable()) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo r = findEditable(node.getChild(i));
            if (r != null) return r;
        }
        return null;
    }

    public boolean goBack() { return performGlobalAction(GLOBAL_ACTION_BACK); }
    public boolean goHome() { return performGlobalAction(GLOBAL_ACTION_HOME); }
    public boolean scrollDown() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        return root != null && scrollNode(root);
    }

    private boolean scrollNode(AccessibilityNodeInfo n) {
        if (n == null) return false;
        if (n.isScrollable() && n.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) return true;
        for (int i = 0; i < n.getChildCount(); i++) {
            if (scrollNode(n.getChild(i))) return true;
        }
        return false;
    }
}
