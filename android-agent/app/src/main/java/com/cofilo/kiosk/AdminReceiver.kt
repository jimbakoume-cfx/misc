package com.cofilo.kiosk

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.app.job.JobParameters
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PersistableBundle

class AdminReceiver : DeviceAdminReceiver() {
    /**
     * Only used on Android 9 and older (newer versions use [PolicyComplianceActivity]). Android forbids starting
     * services or screens at this point, so just remember the details and let a scheduled job do the rest.
     */
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        Provision.consume(context, Provision.extras(intent))
        Provision.schedulePostSetup(context)
    }
}

/** Starts the agent once setup is completely finished (a short while after the last setup step). */
class PostSetupJobService : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        val p = Prefs(this)
        if (p.enrolled || p.hasEnrollConfig) AgentService.start(this)
        return false
    }
    override fun onStopJob(params: JobParameters) = true
}

/** Reads the server URL / enrollment token that the QR code carries, and the after-setup hand-off. */
object Provision {
    const val DEFAULT_SERVER = "https://confiance-kiosk.netlify.app"

    /** The QR code's admin extras. Android delivers them as a PersistableBundle (not a Bundle). */
    @Suppress("DEPRECATION")
    fun extras(intent: Intent): PersistableBundle? =
        runCatching { intent.getParcelableExtra<PersistableBundle>(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE) }.getOrNull()

    fun consume(ctx: Context, extras: PersistableBundle?) {
        val p = Prefs(ctx)
        extras?.getString("enroll_token")?.takeIf { it.isNotBlank() }?.let { p.enrollToken = it }
        extras?.getString("server_url")?.takeIf { it.isNotBlank() }?.let { p.serverUrl = it }
        // The QR stays small by not repeating our own address.
        if (p.enrollToken.isNotEmpty() && p.serverUrl.isEmpty()) p.serverUrl = DEFAULT_SERVER
    }

    /** Becomes the Home app (cheap policy call, no screen or service) so that finishing setup opens the kiosk. */
    fun prepareHome(ctx: Context) {
        if (!Policy.isOwner(ctx)) return
        runCatching {
            val filter = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            Policy.dpm(ctx).addPersistentPreferredActivity(Policy.admin(ctx), filter, ComponentName(ctx, MainActivity::class.java))
        }
    }

    fun schedulePostSetup(ctx: Context) {
        runCatching {
            val job = JobInfo.Builder(4101, ComponentName(ctx, PostSetupJobService::class.java))
                .setMinimumLatency(15_000).setOverrideDeadline(120_000).setPersisted(true).build()
            ctx.getSystemService(JobScheduler::class.java).schedule(job)
        }
    }
}
