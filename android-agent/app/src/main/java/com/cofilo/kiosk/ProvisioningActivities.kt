package com.cofilo.kiosk

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Bundle

/**
 * Android 12+: setup asks the device controller which kind of management it wants.
 * We are a kiosk controller, so we only ever accept FULLY MANAGED DEVICE. If Android does not offer that mode we
 * cancel, because a work profile cannot lock a phone down (and returning a mode that is not offered would fail setup).
 */
class ProvisioningModeActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val allowed = intent.getIntegerArrayListExtra(DevicePolicyManager.EXTRA_PROVISIONING_ALLOWED_PROVISIONING_MODES)
        val full = DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
        val ok = allowed == null || allowed.isEmpty() || allowed.contains(full)
        // Reported before control goes back to setup (Android: no background work after returning).
        Beacon.send(this, "get-provisioning-mode", "allowed=$allowed sdk=${android.os.Build.VERSION.SDK_INT} accepted=$ok", waitMs = 1500)
        if (!ok) { setResult(RESULT_CANCELED); finish(); return }
        setResult(RESULT_OK, Intent()
            .putExtra(DevicePolicyManager.EXTRA_PROVISIONING_MODE, full)
            .putExtra(DevicePolicyManager.EXTRA_PROVISIONING_SKIP_EDUCATION_SCREENS, true))
        finish()
    }
}

/**
 * Android 10+: the last setup step. Android requires this to be quick and to start nothing: no service, no screen.
 * We only record the enrollment details and make ourselves the Home app so setup lands on the kiosk; the rest happens
 * afterwards (Home launches us, and a scheduled job starts the agent).
 */
class PolicyComplianceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Provision.consume(this, intent.getBundleExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE))
        Provision.prepareHome(this)
        Provision.schedulePostSetup(this)
        Beacon.send(this, "policy-compliance", "sdk=${android.os.Build.VERSION.SDK_INT}", waitMs = 1500)
        setResult(RESULT_OK)
        finish()
    }
}
