require('../styles/send-widget.scss');

import {Widget, Inject, Intent} from 'interstellar-core';
import {Account, Asset, Keypair, Operation, TransactionBuilder} from 'stellar-sdk';
import {Alert, AlertGroup, Toast} from 'interstellar-ui-messages';
import moduleDatastore from "../util/module-datastore.es6";

@Widget('send', 'SendWidgetController', 'interstellar-network-widgets/send-widget')
@Inject(
  "$scope", "interstellar-sessions.Sessions", "interstellar-network.Server",
  "interstellar-stellar-api.StellarApi", "interstellar-ui-messages.Alerts",
  "interstellar-ui-messages.Toasts"
)
export default class SendWidgetController {
  constructor($scope, Sessions, Server, StellarApi, Alerts, Toasts) {
    if (!Sessions.hasDefault()) {
      console.error('No session');
      return;
    }

    this.$scope = $scope;
    this.Server = Server;
    this.Sessions = Sessions;
    this.StellarApi = StellarApi;
    this.Toasts = Toasts;
    this.session = Sessions.default;
    this.destination = moduleDatastore.get('destinationAddress');

    this.alerts = new AlertGroup();
    Alerts.registerGroup(this.alerts);

    $scope.$watch('widget.destination', (newValue, oldValue) => {
      this.onChangeDestination.call(this, newValue, oldValue);
    });
  }

  onChangeDestination() {
    this.alerts.clear();

    if (!this.destination) {
      this.destinationAddress = null;
      return;
    }

    this.destinationAddress = null;
    if (Account.isValidAddress(this.destination)) {
      this.destinationAddress = this.destination;
    } else {
      this.StellarApi.federation(this.destination, 'stellar.org')
        .success(data => {
          this.destinationAddress = data.federation_json.destination_new_address;
        })
        .error((data, status) => {
          if (status === 404) {
            this._showError('Can\'t find this user in federation database.');
          } else {
            this._showError('Federation server error.');
          }
        });
    }
  }

  send() {
    this.alerts.clear();

    if (!this.session.getAccount()) {
      this.Sessions.loadDefaultAccount()
        .then(() => {
          if (!this.session.getAccount()) {
            this._showError('Your account is not funded.');
            return;
          }
          this._send();
        });
    } else {
      this._send();
    }
  }

  _send() {
    if (!(this.destinationAddress && Account.isValidAddress(this.destinationAddress))) {
      this._showError('Destination address is not valid.');
      return;
    }

    return this.Server.accounts()
      .address(this.destinationAddress)
      .call()
      .then(() => {
        // Account exist. Send payment operation.
        let operation = Operation.payment({
            destination: this.destinationAddress,
            asset: Asset.native(),
            amount: this.amount
          });
        return this._submitTransaction(operation);
      })
      .catch(err => {
        if (err.name === 'NotFoundError') {
          // Account exist does not exist. Send create_account operation.
          let operation = Operation.createAccount({
            destination: this.destinationAddress,
            startingBalance: this.amount
          });
          return this._submitTransaction(operation);
        } else {
          throw err;
        }
      });
  }

  _submitTransaction(operation) {
    let transaction = new TransactionBuilder(this.session.getAccount())
      .addOperation(operation)
      .addSigner(Keypair.fromSeed(this.session.getSecret()))
      .build();

    return this.Server.submitTransaction(transaction)
      .then(() => {
        let toast = new Toast('Transaction sent!');
        this.Toasts.show(toast);
      })
      .catch(e => this._showError('Network error.'))
      .finally(() => this.$scope.$apply());
  }

  _showError(text) {
    let alert = new Alert({
      title: 'Error',
      text: text,
      type: Alert.TYPES.ERROR
    });
    this.alerts.show(alert);
  }
}
