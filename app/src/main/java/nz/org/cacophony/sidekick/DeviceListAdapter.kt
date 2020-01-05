/*
 * sidekick - Network discovery for Cacophony Project devices
 * Copyright (C) 2018, The Cacophony Project
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

package nz.org.cacophony.sidekick

import androidx.recyclerview.widget.RecyclerView
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

class DeviceListAdapter(private val devices: DeviceList): RecyclerView.Adapter<DeviceListAdapter.DeviceViewHolder>() {

    class DeviceViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val deviceNameView = v.findViewById(R.id.device_name) as TextView
        val clickDevice = v.findViewById(R.id.device_info) as LinearLayout
        val recordingCountView = v.findViewById(R.id.recording_download_count) as TextView
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
        holder.clickDevice.setOnClickListener { device.openManagementInterface() }
        holder.recordingCountView.text = device.statusString
    }

    override fun getItemCount() = devices.size()
}
