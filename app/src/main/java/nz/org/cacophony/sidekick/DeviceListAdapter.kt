package nz.org.cacophony.sidekick

import android.support.v7.widget.RecyclerView
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView


class DeviceListAdapter(private val devices: DeviceList, private val onClick: (d: Device) -> Unit)
    : RecyclerView.Adapter<DeviceListAdapter.DeviceViewHolder>() {

    class DeviceViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val deviceNameView = v.findViewById(R.id.device_name) as TextView
    }

    override fun onCreateViewHolder(parent: ViewGroup,
                                    viewType: Int): DeviceListAdapter.DeviceViewHolder {
        val rowView = LayoutInflater.from(parent.context)
                .inflate(R.layout.device_row, parent, false)
        return DeviceViewHolder(rowView)
    }

    override fun onBindViewHolder(holder: DeviceViewHolder, position: Int) {
        val device = devices.elementAt(position)
        holder.deviceNameView.text = device.name
        holder.deviceNameView.setOnClickListener { onClick(device) }
    }

    override fun getItemCount() = devices.size
}
