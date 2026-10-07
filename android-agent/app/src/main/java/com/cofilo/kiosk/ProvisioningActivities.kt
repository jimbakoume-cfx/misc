package com.cofilo.kiosk

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Bundle

/** Android 12+: tells the setup wizard we want to be a fully managed device owner. */
class ProvisioningModeActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val allowed = intent.getIntegerArrayListExtra(DevicePolicyManager.EXTRA_PROVISIONING_ALLOWED_PROVISIONING_MODES)
        Beacon.send(this, "get-provisioning-mode", "allowed=$allowed sdk=${android.os.Build.VERSION.SDK_INT} chosen=fully-managed(${DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE})")
        val result = Intent().putExtra(
            DevicePolicyManager.EXTRA_PROVISIONING_MODE,
            DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
        )
        setResult(RESULT_OK, result)
        finish()
    }
}

/** Android 9+: final "policy compliance" step of provisioning; nothing to ask, just accept. */
class PolicyComplianceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Beacon.send(this, "policy-compliance", "sdk=${android.os.Build.VERSION.SDK_INT}")
        Provision.consume(
            this,
            intent.getBundleExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
        )
        setResult(RESULT_OK)
        finish()
    }
}
