"use client";
import { SideMenu } from '../../components/SideMenu';
import { MenuPanel } from '../../components/MenuPanel';
import { useState, useEffect } from 'react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';
import { Building2, CreditCard, Menu, ShieldCheck } from 'lucide-react';
import {
  fetchProviderAnalytics,
  fetchProviderProfile,
  fetchUserProfile,
  getAuthRole,
  updateUserProfile,
  AuthError,
  type ProviderAnalyticsReport,
  type ProviderProfile,
  type UserRole,
} from '../../utils/api';

export default function ProfileScreen() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [providerProfile, setProviderProfile] = useState<ProviderProfile | null>(null);
  const [providerAnalytics, setProviderAnalytics] = useState<ProviderAnalyticsReport | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '+1 (555) 123-4567',
    address: '123 Main St, Apt 4B',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94102',
  });

  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    smsNotifications: false,
    reservationReminders: true,
    chargingComplete: true,
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const currentRole = getAuthRole();
        setRole(currentRole);
        const userProfile = await fetchUserProfile();
        
        if (userProfile.email) {
          setFormData(prev => ({
            ...prev,
            email: userProfile.email,
          }));
        }
        
        if (userProfile.firstName) {
          setFormData(prev => ({
            ...prev,
            firstName: userProfile.firstName,
          }));
        }
        
        if (userProfile.lastName) {
          setFormData(prev => ({
            ...prev,
            lastName: userProfile.lastName,
          }));
        }
        
        if (userProfile.phone) {
          setFormData(prev => ({
            ...prev,
            phone: userProfile.phone,
          }));
        }

        if (userProfile.address !== undefined) {
          setFormData(prev => ({
            ...prev,
            address: userProfile.address ?? '',
          }));
        }

        if (userProfile.city !== undefined) {
          setFormData(prev => ({
            ...prev,
            city: userProfile.city ?? '',
          }));
        }

        if (userProfile.state !== undefined) {
          setFormData(prev => ({
            ...prev,
            state: userProfile.state ?? '',
          }));
        }

        if (userProfile.zipCode !== undefined) {
          setFormData(prev => ({
            ...prev,
            zipCode: userProfile.zipCode ?? '',
          }));
        }
        
        if (userProfile.preferences) {
          setPreferences(prev => ({
            ...prev,
            ...userProfile.preferences,
          }));
        }

        if (currentRole === "PROVIDER_ADMIN") {
          const [providerResponse, analyticsResponse] = await Promise.all([
            fetchProviderProfile(),
            fetchProviderAnalytics(),
          ]);
          setProviderProfile(providerResponse.provider);
          setProviderAnalytics(analyticsResponse.report);
        }
      } catch (err) {
        if (err instanceof AuthError) {
          setError('Please sign in to view your profile');
        } else {
          const message = err instanceof Error ? err.message : 'Failed to load profile';
          setError(message);
        }
        console.error('Failed to load profile:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      await updateUserProfile({
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        preferences,
      });

      setSuccessMessage('Profile updated successfully!');
      setIsEditing(false);
      
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      setError(message);
      console.error('Failed to save profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const isEvUser = role === "EV_USER" || role === null;
  const isProvider = role === "PROVIDER_ADMIN";
  const isOperator = role === "PLATFORM_OPERATOR";

  return (
    <div className="flex flex-col sm:flex-row h-screen w-full">
      <div className="sm:hidden flex items-center gap-3 p-3 bg-white border-b border-gray-200">
        <button onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg">
          <Menu className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-medium text-gray-900">Profile</h1>
      </div>
      <MenuPanel isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-4xl mx-auto p-6 sm:p-8 lg:p-12">
          <div className="mb-8">
            <h1 className="hidden sm:block text-2xl sm:text-3xl text-gray-900 mb-2">Profile</h1>
            <p className="text-sm text-gray-500">
              {isProvider
                ? "Manage your provider account and saasPlug subscription"
                : isOperator
                  ? "Manage your platform operator account"
                  : "Manage your account information and preferences"}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">{successMessage}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-gray-600">Loading your profile...</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-medium text-gray-900">Personal Information</h2>
                  {!isEditing && (
                    <Button
                      onClick={() => setIsEditing(true)}
                      variant="outline"
                      size="sm"
                    >
                      Edit
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      disabled={!isEditing}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      disabled={!isEditing}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={!isEditing}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      disabled={!isEditing}
                      className="mt-1"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      disabled={!isEditing}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      disabled={!isEditing}
                      className="mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        disabled={!isEditing}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="zipCode">ZIP Code</Label>
                      <Input
                        id="zipCode"
                        value={formData.zipCode}
                        onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                        disabled={!isEditing}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                    <Button 
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button 
                      onClick={handleCancel}
                      variant="outline"
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

              {isProvider && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
                    <div>
                      <h2 className="text-lg font-medium text-gray-900">Manage Subscription</h2>
                      <p className="mt-1 text-sm text-gray-500">
                        SaaS billing and usage controls for {providerProfile?.name ?? "your provider account"}.
                      </p>
                    </div>
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                      <ShieldCheck className="h-3 w-3" />
                      Active
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <SubscriptionStat
                      icon={Building2}
                      label="Provider"
                      value={providerProfile?.name ?? "Loading"}
                      detail={providerProfile?.contactEmail ?? ""}
                    />
                    <SubscriptionStat
                      icon={CreditCard}
                      label="Open invoices"
                      value={new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(
                        providerAnalytics?.totals.openInvoiceTotalEur ?? 0,
                      )}
                      detail="Current SaaS billing"
                    />
                    <SubscriptionStat
                      icon={ShieldCheck}
                      label="Usage exports"
                      value={`${providerAnalytics?.totals.exportJobs ?? 0}`}
                      detail="Generated export jobs"
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button onClick={() => window.location.assign("/provider")} size="sm">
                      Provider Console
                    </Button>
                    <Button onClick={() => window.location.assign("/provider")} variant="outline" size="sm">
                      View invoices
                    </Button>
                  </div>
                </div>
              )}

              {isOperator && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Operator Access</h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <SubscriptionStat icon={ShieldCheck} label="Role" value="Platform Operator" detail="Global analytics and operations" />
                    <SubscriptionStat icon={Building2} label="Workspace" value="saasPlug" detail="Cross-provider platform view" />
                  </div>
                  <div className="mt-5">
                    <Button onClick={() => window.location.assign("/operator")} size="sm">
                      Operator Console
                    </Button>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-6">Notification Preferences</h2>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="emailNotifications">Email Notifications</Label>
                      <p className="text-sm text-gray-500">Receive updates via email</p>
                    </div>
                    <Switch
                      id="emailNotifications"
                      checked={preferences.emailNotifications}
                      onCheckedChange={(checked: boolean) =>
                        setPreferences({ ...preferences, emailNotifications: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="smsNotifications">SMS Notifications</Label>
                      <p className="text-sm text-gray-500">Receive updates via text message</p>
                    </div>
                    <Switch
                      id="smsNotifications"
                      checked={preferences.smsNotifications}
                      onCheckedChange={(checked: boolean) =>
                        setPreferences({ ...preferences, smsNotifications: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="reservationReminders">Reservation Reminders</Label>
                      <p className="text-sm text-gray-500">Get notified before your reservation expires</p>
                    </div>
                    <Switch
                      id="reservationReminders"
                      checked={preferences.reservationReminders}
                      onCheckedChange={(checked: boolean) =>
                        setPreferences({ ...preferences, reservationReminders: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="chargingComplete">Charging Complete Alerts</Label>
                      <p className="text-sm text-gray-500">Get notified when charging is complete</p>
                    </div>
                    <Switch
                      id="chargingComplete"
                      checked={preferences.chargingComplete}
                      onCheckedChange={(checked: boolean) =>
                        setPreferences({ ...preferences, chargingComplete: checked })
                      }
                    />
                  </div>
                </div>

                {isEditing && (
                  <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                    <Button 
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button 
                      onClick={handleCancel}
                      variant="outline"
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isEvUser && (
      <div className="hidden sm:block sm:w-80 lg:w-96 flex-shrink-0">
        <SideMenu />
      </div>
      )}
    </div>
  );
}

function SubscriptionStat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{label}</p>
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <p className="mt-2 text-base font-medium text-gray-950">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}
